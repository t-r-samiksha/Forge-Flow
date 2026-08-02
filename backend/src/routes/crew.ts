import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import { chatWithLyzrAgent, LyzrConfigError } from "../services/lyzr";
import { parseRouteCall, matchesRole } from "../services/crew";
import { withRetrievedContext, runToolLoop } from "./agent";
import { awardAchievement } from "../services/achievements";

const router = Router();

interface ForgedAgentRow {
  id: string;
  lyzr_agent_id: string;
}

/** Persists the crew record once every real agent it references already
 * exists — called from Level 4 only, after the orchestrator and every
 * sub-agent have real agent_ids (FORGEFLOW_V3_SPEC.md §6: "don't create
 * the crew record before the real agents it references exist"). */
router.post("/create", (req: Request, res: Response) => {
  try {
    const { userId, orchestratorForgedAgentId, name, members } = (req.body ?? {}) as {
      userId?: string;
      orchestratorForgedAgentId?: string;
      name?: string;
      members?: { roleLabel: string; forgedAgentId: string }[];
    };
    if (!userId || !orchestratorForgedAgentId || !Array.isArray(members) || members.length === 0) {
      return res
        .status(400)
        .json({ error: "userId, orchestratorForgedAgentId, and at least one member are required" });
    }

    // Real referential check — every id here must already be a real,
    // previously-shipped forged_agents row (never create a crew pointing
    // at an agent that doesn't exist yet).
    const checkStmt = db.prepare("SELECT id FROM forged_agents WHERE id = ?");
    if (!checkStmt.get(orchestratorForgedAgentId)) {
      return res.status(400).json({ error: "orchestratorForgedAgentId does not reference a real shipped agent" });
    }
    for (const m of members) {
      if (!m.forgedAgentId || !m.roleLabel) {
        return res.status(400).json({ error: "each member needs a roleLabel and forgedAgentId" });
      }
      if (!checkStmt.get(m.forgedAgentId)) {
        return res.status(400).json({ error: `member forgedAgentId ${m.forgedAgentId} does not reference a real shipped agent` });
      }
    }

    const crewId = uuidv4();
    db.prepare(
      `INSERT INTO crews (id, owner_user_id, orchestrator_agent_id, name, created_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(crewId, userId, orchestratorForgedAgentId, name ?? null);

    const insertMember = db.prepare(
      `INSERT INTO crew_members (crew_id, forged_agent_id, role_label) VALUES (?, ?, ?)`
    );
    for (const m of members) insertMember.run(crewId, m.forgedAgentId, m.roleLabel);

    return res.json({ crewId });
  } catch (err) {
    console.error("[crew] create failed", err);
    return res.status(500).json({ error: "Failed to create crew" });
  }
});

router.get("/:crewId", (req: Request, res: Response) => {
  const crew = db.prepare("SELECT * FROM crews WHERE id = ?").get(req.params.crewId);
  if (!crew) return res.status(404).json({ error: "Crew not found" });
  const members = db
    .prepare("SELECT * FROM crew_members WHERE crew_id = ?")
    .all(req.params.crewId);
  return res.json({ crew, members });
});

/** The real routing loop (FORGEFLOW_V3_SPEC.md §6): message -> orchestrator
 * (real Lyzr call, same withRetrievedContext/runToolLoop pipeline
 * /api/agent/chat uses) -> if its real response carries ROUTE_TO: <role>,
 * call the matching sub-agent's real chat endpoint and return ITS real
 * answer -> otherwise the orchestrator's own answer is returned as-is. No
 * simulated routing, no canned response — every branch is a real Lyzr call. */
router.post("/:crewId/chat", async (req: Request, res: Response) => {
  try {
    const { crewId } = req.params;
    const { message, sessionId, userId } = (req.body ?? {}) as {
      message?: string;
      sessionId?: string;
      userId?: string;
    };
    if (!message) return res.status(400).json({ error: "message is required" });

    const crew = db.prepare("SELECT * FROM crews WHERE id = ?").get(crewId) as
      | { id: string; orchestrator_agent_id: string }
      | undefined;
    if (!crew) return res.status(404).json({ error: "Crew not found" });

    const orchestratorRow = db
      .prepare("SELECT id, lyzr_agent_id FROM forged_agents WHERE id = ?")
      .get(crew.orchestrator_agent_id) as ForgedAgentRow | undefined;
    if (!orchestratorRow) return res.status(404).json({ error: "Orchestrator agent not found" });

    const session = sessionId || uuidv4();
    // Orchestrator gets its own stable session (memory of the crew
    // conversation as a whole); each sub-agent gets a session derived
    // from it, stable per crew-conversation + sub-agent, but distinct
    // from the orchestrator's and from any other sub-agent's.
    const orchestratorSession = `${session}_orch`;

    const orchGrounded = await withRetrievedContext(orchestratorRow.lyzr_agent_id, message);
    const { response: orchRaw } = await chatWithLyzrAgent(
      orchestratorRow.lyzr_agent_id,
      orchGrounded,
      orchestratorSession
    );
    const orchResponse = await runToolLoop(orchestratorRow.lyzr_agent_id, orchestratorSession, orchRaw);

    const routedRole = parseRouteCall(orchResponse);
    let finalResponse = orchResponse;
    let routedTo: string | null = null;

    if (routedRole) {
      const members = db
        .prepare("SELECT forged_agent_id, role_label FROM crew_members WHERE crew_id = ?")
        .all(crewId) as { forged_agent_id: string; role_label: string }[];
      const member = members.find((m) => matchesRole(m.role_label, routedRole));

      if (member) {
        const subRow = db
          .prepare("SELECT id, lyzr_agent_id FROM forged_agents WHERE id = ?")
          .get(member.forged_agent_id) as ForgedAgentRow | undefined;

        if (subRow) {
          const subSession = `${session}_${member.forged_agent_id}`;
          const subGrounded = await withRetrievedContext(subRow.lyzr_agent_id, message);
          const { response: subRaw } = await chatWithLyzrAgent(subRow.lyzr_agent_id, subGrounded, subSession);
          finalResponse = await runToolLoop(subRow.lyzr_agent_id, subSession, subRaw);
          routedTo = member.role_label;
        }
      }
      // No matching member found for the parsed role — fall back to the
      // orchestrator's own (ROUTE_TO-marker) text rather than guessing.
    }

    const newAchievements: string[] = [];
    if (userId) {
      db.prepare(`INSERT OR IGNORE INTO users (id, last_forge_date) VALUES (?, ?)`).run(
        userId,
        new Date().toISOString().slice(0, 10)
      );
      db.prepare(
        "UPDATE users SET chat_queries_run = COALESCE(chat_queries_run, 0) + 1 WHERE id = ?"
      ).run(userId);
      const row = db.prepare("SELECT chat_queries_run FROM users WHERE id = ?").get(userId) as
        | { chat_queries_run: number }
        | undefined;
      if ((row?.chat_queries_run ?? 0) >= 20 && awardAchievement(userId, "scientist")) {
        newAchievements.push("scientist");
      }
    }

    return res.json({ response: finalResponse, routedTo, newAchievements });
  } catch (err) {
    if (err instanceof LyzrConfigError) {
      return res.status(503).json({ error: err.message, code: "LYZR_NOT_CONFIGURED" });
    }
    console.error("[crew] chat failed", err);
    return res.status(502).json({ error: err instanceof Error ? err.message : "Crew chat failed" });
  }
});

export default router;
