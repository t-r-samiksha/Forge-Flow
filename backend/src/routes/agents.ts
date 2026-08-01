import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { createLyzrAgent, LyzrConfigError } from "../services/lyzr";
import { calcForgeScore } from "../services/forgeScoring";
import { copyToolDefs, toolContractForAgent } from "./tools";

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
    // tool-equipped agent stays tool-equipped after an edit.
    const toolContract = toolContractForAgent(row.lyzr_agent_id);

    const { agentId: newLyzrId, payload } = await createLyzrAgent({
      name: row.name,
      instructions: instructions + toolContract,
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

export default router;
