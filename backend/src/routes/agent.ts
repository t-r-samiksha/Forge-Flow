import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import { createLyzrAgent, chatWithLyzrAgent, LyzrConfigError } from "../services/lyzr";
import { calcForgeScore } from "../services/forgeScoring";
import { awardAchievement } from "../services/achievements";
import { withKnowledgeCorpus } from "../services/knowledge";

const router = Router();

router.post("/create", async (req: Request, res: Response) => {
  try {
    const {
      userId,
      campaignId,
      name,
      instructions,
      model,
      temperature,
      config,
      forgeTime,
      xpEarned,
      estimateMin,
      role,
      goal,
      description,
      extraFeatures,
    } = req.body ?? {};

    if (!userId || !name || !instructions || !model || temperature === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { agentId, payload } = await createLyzrAgent({
      name,
      instructions: withKnowledgeCorpus(campaignId, instructions),
      model,
      temperature: Number(temperature),
      role,
      goal,
      description,
      extraFeatures,
    });

    const resolvedConfig: Record<string, string> = config ?? {};
    const topKRaw = parseInt(resolvedConfig.ret ?? "", 10);
    const forgeScore = calcForgeScore(
      {
        instruction: instructions,
        temperature: Number(temperature),
        model,
        ...(isNaN(topKRaw) ? {} : { topK: topKRaw }),
      },
      Number(forgeTime) || 0,
      Number(estimateMin) || 22
    );
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO forged_agents
        (id, user_id, campaign_id, name, lyzr_agent_id, config, original_config, lyzr_payload, forge_score, forge_time, xp_earned, version, forged_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      id,
      userId,
      campaignId ?? "retriever",
      name,
      agentId,
      JSON.stringify(resolvedConfig),
      JSON.stringify(resolvedConfig),
      JSON.stringify(payload),
      forgeScore,
      Number(forgeTime) || 0,
      Number(xpEarned) || 0,
      now
    );

    // Shipping ends the in-progress build for this campaign — clear the
    // resume pointer so a later visit doesn't try to resume a finished build.
    db.prepare(
      `UPDATE users SET active_campaign_id = NULL, current_mission_index = 0, build_slot_values = '{}', build_timer_seconds = 0
       WHERE id = ?`
    ).run(userId);

    const forgedCount = (
      db.prepare("SELECT COUNT(*) AS c FROM forged_agents WHERE user_id = ?").get(userId) as {
        c: number;
      }
    ).c;

    const newAchievements: string[] = [];
    if (forgedCount === 1 && awardAchievement(userId, "first_forge")) {
      newAchievements.push("first_forge");
    }
    if (Number(forgeTime) > 0 && Number(forgeTime) < 900 && awardAchievement(userId, "speed_forge")) {
      newAchievements.push("speed_forge");
    }
    if (Number(temperature) <= 0.2 && awardAchievement(userId, "zero_hallucination")) {
      newAchievements.push("zero_hallucination");
    }
    if (forgedCount >= 3 && awardAchievement(userId, "collection_start")) {
      newAchievements.push("collection_start");
    }

    return res.json({
      id,
      campaignId: campaignId ?? "retriever",
      name,
      lyzrAgentId: agentId,
      config: resolvedConfig,
      originalConfig: resolvedConfig,
      lyzrPayload: payload,
      forgeScore,
      forgeTime: Number(forgeTime) || 0,
      xpEarned: Number(xpEarned) || 0,
      version: 1,
      forgedAt: now,
      newAchievements,
    });
  } catch (err) {
    if (err instanceof LyzrConfigError) {
      return res.status(503).json({ error: err.message, code: "LYZR_NOT_CONFIGURED" });
    }
    console.error(err);
    return res.status(502).json({ error: "Failed to create agent on Lyzr" });
  }
});

router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { agentId, message, sessionId, userId } = req.body ?? {};
    if (!agentId || !message) {
      return res.status(400).json({ error: "agentId and message are required" });
    }
    const { response } = await chatWithLyzrAgent(agentId, message, sessionId ?? uuidv4());

    const newAchievements: string[] = [];
    if (userId) {
      db.prepare(
        `INSERT OR IGNORE INTO users (id, last_forge_date) VALUES (?, ?)`
      ).run(userId, new Date().toISOString().slice(0, 10));
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

    return res.json({ response, newAchievements });
  } catch (err) {
    if (err instanceof LyzrConfigError) {
      return res.status(503).json({ error: err.message, code: "LYZR_NOT_CONFIGURED" });
    }
    console.error(err);
    return res.status(502).json({ error: "Failed to reach Lyzr agent" });
  }
});

/** Real Lyzr round-trip for Multiverse Compare's "Version B" — creates a
 * genuine Lyzr agent and sends it one real message, but never writes to
 * forged_agents. Deliberately ephemeral: Compare is "try before you
 * commit", so a preview shouldn't show up in the user's agent list,
 * leaderboard, or earn achievements. Finalizing (PUT .../config) is what
 * actually persists a config change. */
router.post("/preview", async (req: Request, res: Response) => {
  try {
    const { name, instructions, model, temperature, message, role, goal, description } =
      req.body ?? {};
    if (!instructions || !model || temperature === undefined || !message) {
      return res
        .status(400)
        .json({ error: "instructions, model, temperature, and message are required" });
    }

    const { agentId } = await createLyzrAgent({
      name: name || "ForgeFlow Preview",
      instructions,
      model,
      temperature: Number(temperature),
      role,
      goal,
      description,
    });
    const { response } = await chatWithLyzrAgent(agentId, message, uuidv4());

    return res.json({ response });
  } catch (err) {
    if (err instanceof LyzrConfigError) {
      return res.status(503).json({ error: err.message, code: "LYZR_NOT_CONFIGURED" });
    }
    console.error(err);
    return res.status(502).json({ error: "Failed to preview agent on Lyzr" });
  }
});

export default router;
