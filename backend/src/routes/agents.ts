import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { createLyzrAgent, deleteLyzrAgent, LyzrConfigError } from "../services/lyzr";
import { calcForgeScore } from "../services/forgeScoring";
import { copyToolDefs, toolContractForAgent, getToolRows, rowsToInputs } from "./tools";
import { validateToolDef } from "../services/tools";

const router = Router();

interface ForgedAgentRow {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  lyzr_agent_id: string;
  config: string;
  original_config: string;
  lyzr_payload: string | null;
  forge_score: number;
  forge_time: number;
  xp_earned: number;
  version: number;
  forged_at: string;
  last_edited_at: string | null;
  template_id: string | null;
}

function rowToForgedAgent(row: ForgedAgentRow) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    lyzrAgentId: row.lyzr_agent_id,
    config: JSON.parse(row.config || "{}"),
    originalConfig: JSON.parse(row.original_config || "{}"),
    lyzrPayload: JSON.parse(row.lyzr_payload || "{}"),
    forgeScore: row.forge_score,
    forgeTime: row.forge_time,
    xpEarned: row.xp_earned,
    version: row.version,
    forgedAt: row.forged_at,
    lastEditedAt: row.last_edited_at ?? undefined,
    // Genuinely null for "Start from scratch" builds and for every agent
    // shipped before this column existed — never guessed (row 1, FIX 1).
    templateId: row.template_id ?? null,
  };
}

router.get("/:userId", (req: Request, res: Response) => {
  const rows = db
    .prepare("SELECT * FROM forged_agents WHERE user_id = ? ORDER BY forged_at DESC")
    .all(req.params.userId) as ForgedAgentRow[];
  res.json(rows.map(rowToForgedAgent));
});

router.get("/:userId/:agentId", (req: Request, res: Response) => {
  const row = db
    .prepare("SELECT * FROM forged_agents WHERE user_id = ? AND id = ?")
    .get(req.params.userId, req.params.agentId) as ForgedAgentRow | undefined;
  if (!row) return res.status(404).json({ error: "Agent not found" });
  res.json(rowToForgedAgent(row));
});

router.put("/:userId/:agentId/config", async (req: Request, res: Response) => {
  try {
    const { userId, agentId } = req.params;
    const { updatedSlots, instructions, model, temperature, estimateMin } = (req.body ?? {}) as {
      updatedSlots?: Record<string, string>;
      instructions?: string;
      model?: string;
      temperature?: number;
      estimateMin?: number;
    };
    if (!updatedSlots || !instructions || !model || temperature === undefined) {
      return res
        .status(400)
        .json({ error: "updatedSlots, instructions, model, and temperature are required" });
    }

    const row = db
      .prepare("SELECT * FROM forged_agents WHERE user_id = ? AND id = ?")
      .get(userId, agentId) as ForgedAgentRow | undefined;
    if (!row) return res.status(404).json({ error: "Agent not found" });

    const currentConfig: Record<string, string> = JSON.parse(row.config || "{}");
    const nextConfig = { ...currentConfig, ...updatedSlots };

    // Re-forge mints a new Lyzr agent_id — carry the tool contract into
    // the new instructions and re-key tool_defs onto the new id, so a
    // tool-equipped agent stays tool-equipped after an edit. Reading
    // tool_defs here also picks up any tool registered post-ship via
    // POST /api/tools/:agentId since the last forge, not just ones
    // attached at original creation.
    const toolRows = getToolRows(row.lyzr_agent_id);
    const toolInputs = rowsToInputs(toolRows);

    // Real backend-side gate (row 7b) — a tool could have reached tool_defs
    // via the weaker POST /api/tools/:agentId registration path since the
    // last forge; re-forge is what actually bakes its contract into a
    // fresh agent's instructions, so this is where an invalid one must be
    // caught rather than shipped forward. Reject the whole re-forge,
    // matching this route's own required-field validation above.
    const toolProblems = toolInputs
      .map((t) => ({ toolName: t.toolName || "(unnamed)", errors: validateToolDef(t) }))
      .filter((p) => p.errors.length > 0);
    if (toolProblems.length > 0) {
      return res.status(400).json({ error: "Invalid tool configuration", toolErrors: toolProblems });
    }

    const toolContract = toolContractForAgent(row.lyzr_agent_id);
    const instructionsWithToolContract = instructions + toolContract;

    const { agentId: newLyzrId, payload } = await createLyzrAgent({
      name: row.name,
      instructions: instructionsWithToolContract,
      model,
      temperature: Number(temperature),
    });
    if (toolContract) copyToolDefs(row.lyzr_agent_id, newLyzrId);

    const topKRaw = parseInt(nextConfig.ret ?? "", 10);
    const forgeScore = calcForgeScore(
      {
        instruction: instructions,
        temperature: Number(temperature),
        model,
        ...(isNaN(topKRaw) ? {} : { topK: topKRaw }),
        tools: toolInputs.map((t) => ({
          toolName: t.toolName,
          description: t.description,
          endpointUrl: t.endpointUrl,
        })),
        instructionsWithToolContract,
      },
      row.forge_time,
      Number(estimateMin) || 22
    );
    const newVersion = row.version + 1;
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE forged_agents
       SET lyzr_agent_id = ?, config = ?, lyzr_payload = ?, forge_score = ?, version = ?, last_edited_at = ?
       WHERE id = ?`
    ).run(newLyzrId, JSON.stringify(nextConfig), JSON.stringify(payload), forgeScore, newVersion, now, agentId);

    return res.json({ newAgentId: newLyzrId, forgeScore, version: newVersion, lyzrPayload: payload });
  } catch (err) {
    if (err instanceof LyzrConfigError) {
      return res.status(503).json({ error: err.message, code: "LYZR_NOT_CONFIGURED" });
    }
    console.error(err);
    return res.status(502).json({ error: "Failed to re-forge agent on Lyzr" });
  }
});

/** Real deletion (row: new capability, no prior DELETE route existed —
 * every removal before this was a manual verification-script cleanup).
 * Ownership is enforced by the WHERE clause below (agent must belong to
 * :userId), same pattern GET/PUT already use. If this agent is a real
 * Crew member or orchestrator, deletion is blocked rather than cascaded:
 * crew_members/crew.orchestrator_agent_id key on this row's internal id
 * (deliberately stable across re-forge, per §27/§6), and there is no crew
 * repair/removal feature to fall back the routing onto — silently
 * deleting would leave the crew's real ROUTE_TO pointing at a Lyzr agent
 * that no longer exists. */
router.delete("/:userId/:agentId", async (req: Request, res: Response) => {
  try {
    const { userId, agentId } = req.params;
    const row = db
      .prepare("SELECT * FROM forged_agents WHERE user_id = ? AND id = ?")
      .get(userId, agentId) as ForgedAgentRow | undefined;
    if (!row) return res.status(404).json({ error: "Agent not found" });

    const asMember = db
      .prepare("SELECT role_label FROM crew_members WHERE forged_agent_id = ?")
      .get(agentId) as { role_label: string } | undefined;
    const asOrchestrator = db
      .prepare("SELECT id FROM crews WHERE orchestrator_agent_id = ?")
      .get(agentId) as { id: string } | undefined;
    if (asMember) {
      return res.status(409).json({
        error: `This agent is a real crew member ("${asMember.role_label}") — deleting it would break that crew's routing. Crew deletion/repair isn't supported yet, so this agent can't be deleted on its own.`,
      });
    }
    if (asOrchestrator) {
      return res.status(409).json({
        error:
          "This agent is a real crew's orchestrator — deleting it would break the whole crew. Crew deletion isn't supported yet, so this agent can't be deleted on its own.",
      });
    }

    await deleteLyzrAgent(row.lyzr_agent_id);

    // Real dependent rows, cleaned up alongside the parent — knowledge_docs
    // and tool_defs are keyed by the real Lyzr agent id (§10), redteam_runs
    // by this row's internal id.
    const knowledgeDeleted = db.prepare("DELETE FROM knowledge_docs WHERE agent_id = ?").run(row.lyzr_agent_id);
    const toolsDeleted = db.prepare("DELETE FROM tool_defs WHERE agent_id = ?").run(row.lyzr_agent_id);
    const redteamDeleted = db.prepare("DELETE FROM redteam_runs WHERE agent_id = ?").run(agentId);
    db.prepare("DELETE FROM forged_agents WHERE id = ?").run(agentId);

    console.log(
      `[agents] deleted agentId=${agentId} (lyzr=${row.lyzr_agent_id}) — ` +
        `knowledge_docs=${knowledgeDeleted.changes} tool_defs=${toolsDeleted.changes} redteam_runs=${redteamDeleted.changes}`
    );

    return res.json({ deleted: true, id: agentId });
  } catch (err) {
    if (err instanceof LyzrConfigError) {
      return res.status(503).json({ error: err.message, code: "LYZR_NOT_CONFIGURED" });
    }
    console.error(err);
    return res.status(502).json({ error: "Failed to delete agent on Lyzr" });
  }
});

export default router;
