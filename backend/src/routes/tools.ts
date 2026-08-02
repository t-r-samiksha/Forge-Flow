import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import {
  buildToolContract,
  validateToolDef,
  type ParamsSchema,
  type ToolDefInput,
  type ToolDefRow,
} from "../services/tools";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { ownsLyzrAgent } from "../services/ownership";

const router = Router();

function rowToTool(row: ToolDefRow) {
  return {
    id: row.id,
    agentId: row.agent_id,
    toolName: row.tool_name,
    description: row.description ?? "",
    paramsSchema: JSON.parse(row.params_schema || "{}") as ParamsSchema,
    endpointUrl: row.endpoint_url ?? "",
    createdAt: row.created_at,
  };
}

/** Shared helpers used by both these routes and the create/re-forge
 * flows in agent.ts / agents.ts, so tool_defs access lives in one place. */
export function getToolRows(agentId: string): ToolDefRow[] {
  return db
    .prepare("SELECT * FROM tool_defs WHERE agent_id = ? ORDER BY created_at ASC")
    .all(agentId) as ToolDefRow[];
}

export function rowsToInputs(rows: ToolDefRow[]): ToolDefInput[] {
  return rows.map((r) => ({
    toolName: r.tool_name,
    description: r.description ?? "",
    paramsSchema: JSON.parse(r.params_schema || "{}") as ParamsSchema,
    endpointUrl: r.endpoint_url ?? "",
  }));
}

/** The tool contract to append to agent_instructions for an agent that
 * already has tool_defs rows — used on re-forge to carry tools forward. */
export function toolContractForAgent(agentId: string): string {
  return buildToolContract(rowsToInputs(getToolRows(agentId)));
}

/** userId is required (not inferred) — every real call site already knows
 * the verified owner (the /create caller, the tools.ts POST handler, or
 * copyToolDefs carrying the original owner forward on re-forge), so there's
 * no path where a tool_defs row is written without a real owner attached
 * (§36 — this table had no user_id column or ownership concept at all
 * before). */
export function insertToolDef(agentId: string, tool: ToolDefInput, userId: string): ToolDefRow {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tool_defs (id, agent_id, user_id, tool_name, description, params_schema, endpoint_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    agentId,
    userId,
    tool.toolName,
    tool.description,
    JSON.stringify(tool.paramsSchema ?? {}),
    tool.endpointUrl,
    now
  );
  return {
    id,
    agent_id: agentId,
    tool_name: tool.toolName,
    description: tool.description,
    params_schema: JSON.stringify(tool.paramsSchema ?? {}),
    endpoint_url: tool.endpointUrl,
    created_at: now,
  };
}

/** Re-forge creates a brand-new Lyzr agent_id; tool_defs are keyed by
 * that id, so copy them onto the new agent so the executable registry
 * follows the contract we just baked into the new agent's instructions.
 * Ownership carries forward unchanged — re-forging doesn't transfer an
 * agent to anyone else. */
export function copyToolDefs(fromAgentId: string, toAgentId: string, userId: string): void {
  const rows = getToolRows(fromAgentId);
  for (const r of rows) {
    insertToolDef(
      toAgentId,
      {
        toolName: r.tool_name,
        description: r.description ?? "",
        paramsSchema: JSON.parse(r.params_schema || "{}") as ParamsSchema,
        endpointUrl: r.endpoint_url ?? "",
      },
      userId
    );
  }
}

/** Parse only — deliberately does not judge name/description/endpoint
 * validity here (see validateToolDef below, the same real gate /create and
 * re-forge use). paramsSchema's per-param type check stays here since it's
 * a structural parse concern validateToolDef doesn't cover. */
function parseToolBody(body: unknown): ToolDefInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const toolName = String(b.toolName ?? b.tool_name ?? "").trim();
  const description = String(b.description ?? "").trim();
  const endpointUrl = String(b.endpointUrl ?? b.endpoint_url ?? "").trim();
  const rawSchema = (b.paramsSchema ?? b.params_schema ?? {}) as Record<string, unknown>;

  const paramsSchema: ParamsSchema = {};
  for (const [k, v] of Object.entries(rawSchema)) {
    const t = String(v);
    if (t !== "string" && t !== "number" && t !== "boolean") {
      return { error: `param "${k}" has invalid type "${t}" (use string|number|boolean)` };
    }
    paramsSchema[k] = t;
  }
  return { toolName, description, paramsSchema, endpointUrl };
}

router.post("/:agentId", requireAuth, (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const agentId = String(req.params.agentId);
  // Real ownership gate (§36) — this endpoint used to accept a tool
  // registration for ANY agentId with no check it belonged to the caller.
  if (!ownsLyzrAgent(userId, agentId)) {
    return res.status(404).json({ error: "Agent not found" });
  }
  const parsed = parseToolBody(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });

  // Real backend-side gate (row 7b, closing the last of the three real
  // entry points a tool config can enter through — see /create in
  // routes/agent.ts and re-forge in routes/agents.ts for the other two).
  // This is post-ship registration: the one path that previously only
  // checked toolName's shape and endpointUrl's non-emptiness, letting a
  // trivial description or a malformed "not-a-real-url" endpoint straight
  // into tool_defs with no gate at all.
  const errors = validateToolDef(parsed);
  if (errors.length > 0) {
    return res.status(400).json({
      error: "Invalid tool configuration",
      toolErrors: [{ toolName: parsed.toolName || "(unnamed)", errors }],
    });
  }

  const existing = getToolRows(agentId).some((r) => r.tool_name === parsed.toolName);
  if (existing) {
    return res.status(409).json({ error: `a tool named "${parsed.toolName}" already exists on this agent` });
  }

  const row = insertToolDef(agentId, parsed, userId);
  console.log(`[tools] registered "${parsed.toolName}" -> ${parsed.endpointUrl} on agentId=${agentId}`);
  return res.json(rowToTool(row));
});

router.get("/:agentId", requireAuth, (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const agentId = String(req.params.agentId);
  if (!ownsLyzrAgent(userId, agentId)) {
    return res.status(404).json({ error: "Agent not found" });
  }
  const rows = getToolRows(agentId);
  res.json(rows.map(rowToTool));
});

router.delete("/:agentId/:toolId", requireAuth, (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const agentId = String(req.params.agentId);
  const toolId = String(req.params.toolId);
  if (!ownsLyzrAgent(userId, agentId)) {
    return res.status(404).json({ error: "Agent not found" });
  }
  const row = db
    .prepare("SELECT * FROM tool_defs WHERE agent_id = ? AND id = ?")
    .get(agentId, toolId) as ToolDefRow | undefined;
  if (!row) return res.status(404).json({ error: "Tool not found" });
  db.prepare("DELETE FROM tool_defs WHERE id = ?").run(toolId);
  res.json({ deleted: true, id: toolId });
});

export default router;
