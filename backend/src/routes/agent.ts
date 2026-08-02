import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import { createLyzrAgent, chatWithLyzrAgent, LyzrConfigError } from "../services/lyzr";
import { calcForgeScore } from "../services/forgeScoring";
import { awardAchievement } from "../services/achievements";
import { embedText } from "../services/embeddings";
import { search } from "../services/qdrant";
import {
  buildToolContract,
  executeTool,
  parseToolCall,
  validateArgs,
  type ParamsSchema,
  type ToolDefInput,
} from "../services/tools";
import { getToolRows, insertToolDef } from "./tools";

const router = Router();

/** Normalizes the loosely-typed `tools` array a client may send with
 * /create into validated ToolDefInputs. Silently drops malformed entries
 * rather than failing the whole ship — a bad tool shouldn't block agent
 * creation, and the UI validates before sending anyway. */
function normalizeIncomingTools(raw: unknown): ToolDefInput[] {
  if (!Array.isArray(raw)) return [];
  const out: ToolDefInput[] = [];
  for (const t of raw) {
    const toolName = String(t?.toolName ?? t?.name ?? "").trim();
    const endpointUrl = String(t?.endpointUrl ?? "").trim();
    if (!toolName || !endpointUrl || !/^[a-zA-Z0-9_]+$/.test(toolName)) continue;
    const schema: ParamsSchema = {};
    for (const [k, v] of Object.entries((t?.paramsSchema ?? {}) as Record<string, unknown>)) {
      const ty = String(v);
      if (ty === "string" || ty === "number" || ty === "boolean") schema[k] = ty;
    }
    out.push({
      toolName,
      description: String(t?.description ?? "").trim(),
      paramsSchema: schema,
      endpointUrl,
    });
  }
  return out;
}

/** The real ReAct-style tool loop (FORGEFLOW_V3_SPEC.md §5). After Lyzr
 * responds, if this agent has registered tools and the response carries a
 * TOOL_CALL marker, we execute the real HTTP call and feed the real
 * result back into the same session, looping until the agent answers in
 * natural language (or we hit the safety cap). No tools / no marker →
 * the original response is returned untouched. */
export async function runToolLoop(
  agentId: string,
  sessionId: string,
  firstResponse: string
): Promise<string> {
  const toolRows = getToolRows(agentId);
  if (toolRows.length === 0) return firstResponse;

  const byName = new Map(toolRows.map((r) => [r.tool_name, r]));
  let response = firstResponse;

  for (let iter = 0; iter < 4; iter++) {
    const call = parseToolCall(response);
    if (!call) return response;

    const row = byName.get(call.tool);
    if (!row) {
      console.log(`[tools] agent asked for unknown tool "${call.tool}" — feeding error back`);
      response = (
        await chatWithLyzrAgent(
          agentId,
          `TOOL_ERROR: no tool named "${call.tool}" is registered. Answer the user without it.`,
          sessionId
        )
      ).response;
      continue;
    }

    const schema = JSON.parse(row.params_schema || "{}") as ParamsSchema;
    const validation = validateArgs(schema, call.args);
    if (!validation.ok) {
      console.log(`[tools] arg validation failed for "${call.tool}": ${validation.error}`);
      response = (
        await chatWithLyzrAgent(
          agentId,
          `TOOL_ERROR for ${call.tool}: ${validation.error}. Ask the user for the missing detail or answer without the tool.`,
          sessionId
        )
      ).response;
      continue;
    }

    console.log(
      `[tools] executing "${call.tool}" -> ${row.endpoint_url} args=${JSON.stringify(validation.coerced)}`
    );
    let execResult;
    try {
      execResult = await executeTool(row.endpoint_url ?? "", validation.coerced);
    } catch (err) {
      execResult = { ok: false, result: err instanceof Error ? err.message : "tool call failed" };
    }
    console.log(
      `[tools] "${call.tool}" result (ok=${execResult.ok}): ${JSON.stringify(execResult.result).slice(0, 240)}`
    );

    const followUp =
      `TOOL_RESULT for ${call.tool}: ${JSON.stringify(execResult.result)}\n\n` +
      `Use this real result to answer the user's original question in natural language. ` +
      `Do not emit another TOOL_CALL unless you genuinely need a different tool.`;
    response = (await chatWithLyzrAgent(agentId, followUp, sessionId)).response;
  }

  return response;
}

/** If the agent has ingested knowledge docs, retrieves the top matching
 * chunks for the query and prepends them to the message sent to Lyzr.
 * Falls back to the raw message on any retrieval failure — a knowledge
 * base outage shouldn't take down chat entirely. */
export async function withRetrievedContext(agentId: string, message: string): Promise<string> {
  const docCount = (
    db.prepare("SELECT COUNT(*) AS c FROM knowledge_docs WHERE agent_id = ?").get(agentId) as {
      c: number;
    }
  ).c;
  if (docCount === 0) return message;

  try {
    const queryVector = await embedText(message);
    const chunks = await search(agentId, queryVector, 5);
    if (chunks.length === 0) return message;

    console.log(
      `[knowledge] retrieved ${chunks.length} chunk(s) for agentId=${agentId}: ` +
        chunks.map((c) => `${c.filename}#${c.chunkIndex} (score=${c.score.toFixed(3)})`).join(", ")
    );

    const context = chunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
    return `Use the following retrieved context to answer the question. If the context does not contain the answer, say so instead of guessing.\n\nContext:\n${context}\n\nQuestion: ${message}`;
  } catch (err) {
    console.error("[knowledge] retrieval failed, falling back to raw message", err);
    return message;
  }
}

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
      tools,
    } = req.body ?? {};

    if (!userId || !name || !instructions || !model || temperature === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // If tools are attached, the contract that makes the LLM emit
    // TOOL_CALL must be baked into agent_instructions at creation — the
    // tool_defs registry alone doesn't tell the model it can call out.
    const toolDefs = normalizeIncomingTools(tools);
    const instructionsWithTools = instructions + buildToolContract(toolDefs);

    const { agentId, payload } = await createLyzrAgent({
      name,
      instructions: instructionsWithTools,
      model,
      temperature: Number(temperature),
      role,
      goal,
      description,
      extraFeatures,
    });

    // Persist the executable registry now that we have the real agent_id
    // (tool_defs, like knowledge_docs, are keyed by the Lyzr agent id).
    for (const tool of toolDefs) insertToolDef(agentId, tool);
    if (toolDefs.length > 0) {
      console.log(`[tools] baked contract for ${toolDefs.length} tool(s) into agentId=${agentId}`);
    }

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
      campaignId ?? "custom",
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
      campaignId: campaignId ?? "custom",
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
    const session = sessionId ?? uuidv4();
    const groundedMessage = await withRetrievedContext(agentId, message);
    const { response: rawResponse } = await chatWithLyzrAgent(agentId, groundedMessage, session);
    // Real tool-execution loop — no-op unless this agent has tool_defs and
    // the response carries a TOOL_CALL marker (FORGEFLOW_V3_SPEC.md §5).
    const response = await runToolLoop(agentId, session, rawResponse);

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
