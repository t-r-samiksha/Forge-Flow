import { db } from "../db";

/** Real ownership checks (§36) — shared by every route that scopes access
 * to a specific forged agent or crew, so "does this belong to this
 * verified caller" is answered the same way everywhere instead of being
 * re-derived per file. Callers pass req.userId (the token-verified id from
 * requireAuth), never a client-supplied param. */

interface ForgedAgentOwnerRow {
  id: string;
  user_id: string | null;
}

/** knowledge_docs.agent_id / tool_defs.agent_id store the real Lyzr
 * agent_id (§10) — this is the lookup those two tables need. */
export function ownsLyzrAgent(userId: string, lyzrAgentId: string): boolean {
  const row = db
    .prepare("SELECT id, user_id FROM forged_agents WHERE lyzr_agent_id = ?")
    .get(lyzrAgentId) as ForgedAgentOwnerRow | undefined;
  return !!row && row.user_id === userId;
}

/** redteam_runs.agent_id stores the internal forged_agents.id (§10) —
 * this is that lookup. */
export function ownsForgedAgentId(userId: string, forgedAgentId: string): boolean {
  const row = db
    .prepare("SELECT id, user_id FROM forged_agents WHERE id = ?")
    .get(forgedAgentId) as ForgedAgentOwnerRow | undefined;
  return !!row && row.user_id === userId;
}

interface CrewOwnerRow {
  id: string;
  owner_user_id: string;
}

export function ownsCrew(userId: string, crewId: string): boolean {
  const row = db.prepare("SELECT id, owner_user_id FROM crews WHERE id = ?").get(crewId) as
    | CrewOwnerRow
    | undefined;
  return !!row && row.owner_user_id === userId;
}
