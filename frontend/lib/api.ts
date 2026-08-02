const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class LyzrNotConfiguredError extends Error {}

export interface ApiForgedAgent {
  id: string;
  campaignId: string;
  name: string;
  lyzrAgentId: string;
  config: Record<string, string>;
  originalConfig: Record<string, string>;
  lyzrPayload: Record<string, unknown>;
  forgeScore: number;
  forgeTime: number;
  xpEarned: number;
  version: number;
  forgedAt: string;
  lastEditedAt?: string;
  /** Which freeform ?template=<id> this build started from — null for a
   * genuine "Start from scratch" build or an agent shipped before this
   * field existed (never guessed, FIX 1). */
  templateId?: string | null;
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 503) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new LyzrNotConfiguredError(body.error ?? "Lyzr is not configured");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface CreateAgentPayload {
  userId: string;
  campaignId: string;
  name: string;
  instructions: string;
  model: string;
  temperature: number;
  config: Record<string, string>;
  forgeTime: number;
  xpEarned: number;
  estimateMin: number;
  role?: string;
  goal?: string;
  description?: string;
  extraFeatures?: Record<string, unknown>;
  /** Attached tools (Phase 3). The backend bakes a TOOL_CALL contract
   * into agent_instructions and persists these to the tool_defs registry. */
  tools?: {
    toolName: string;
    description: string;
    paramsSchema: Record<string, string>;
    endpointUrl: string;
  }[];
  /** Crew orchestrator only (Phase 5, FORGEFLOW_V3_SPEC.md §6) — the real
   * role labels of this crew's already-shipped sub-agents. The backend
   * bakes a ROUTE_TO contract into agent_instructions, same mechanism as
   * TOOL_CALL. Never sent for a regular single-agent or sub-agent build. */
  crewRoles?: string[];
  /** Which ?template=<id> this freeform build started from — omitted (or
   * undefined) for "Start from scratch". Metadata only: does not change
   * AgentDraft's shape, the Level/Mission skeleton, or generated code
   * (§3b still holds — same skeleton regardless of template), just what
   * FreeformAgentCard shows afterward (FIX 1). */
  templateId?: string | null;
}

export async function createAgent(
  payload: CreateAgentPayload
): Promise<ApiForgedAgent & { newAchievements: string[] }> {
  const res = await fetch(`${API_URL}/api/agent/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<ApiForgedAgent & { newAchievements: string[] }>(res);
}

export async function chatWithAgent(
  agentId: string,
  message: string,
  sessionId: string,
  userId?: string
): Promise<{ response: string; newAchievements: string[] }> {
  const res = await fetch(`${API_URL}/api/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, message, sessionId, userId }),
  });
  return handle<{ response: string; newAchievements: string[] }>(res);
}

/** Real Multi-Agent Crew (FORGEFLOW_V3_SPEC.md §6). Called from Level 4
 * only, once every real agent_id it references already exists. */
export async function createCrew(payload: {
  userId: string;
  orchestratorForgedAgentId: string;
  name?: string;
  members: { roleLabel: string; forgedAgentId: string }[];
}): Promise<{ crewId: string }> {
  const res = await fetch(`${API_URL}/api/crew/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<{ crewId: string }>(res);
}

export interface CrewInfo {
  crew: { id: string; owner_user_id: string; orchestrator_agent_id: string; name: string | null };
  members: { crew_id: string; forged_agent_id: string; role_label: string }[];
}

export async function getCrew(crewId: string): Promise<CrewInfo> {
  const res = await fetch(`${API_URL}/api/crew/${crewId}`);
  return handle<CrewInfo>(res);
}

/** The real routing chat loop — message goes to the real orchestrator,
 * which may hand off to a real sub-agent (see backend/src/routes/crew.ts).
 * `routedTo` is the real role label that answered, or null if the
 * orchestrator answered directly — genuine metadata, not decorative. */
export async function chatWithCrew(
  crewId: string,
  message: string,
  sessionId: string,
  userId?: string
): Promise<{ response: string; routedTo: string | null; newAchievements: string[] }> {
  const res = await fetch(`${API_URL}/api/crew/${crewId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId, userId }),
  });
  return handle<{ response: string; routedTo: string | null; newAchievements: string[] }>(res);
}

export interface PreviewAgentPayload {
  name?: string;
  instructions: string;
  model: string;
  temperature: number;
  message: string;
  role?: string;
  goal?: string;
  description?: string;
}

/** Real Lyzr call for Multiverse Compare's Version B — creates a genuine
 * (throwaway) agent and chats it once. Not persisted anywhere server-side. */
export async function previewAgent(payload: PreviewAgentPayload): Promise<{ response: string }> {
  const res = await fetch(`${API_URL}/api/agent/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<{ response: string }>(res);
}

export async function listAgents(userId: string): Promise<ApiForgedAgent[]> {
  const res = await fetch(`${API_URL}/api/agents/${userId}`);
  return handle<ApiForgedAgent[]>(res);
}

export interface RedTeamResult {
  category: string;
  prompt: string;
  response: string;
  verdict: "held" | "broke";
  reason: string;
  suggestion: string;
}

export interface RedTeamAttack {
  category: string;
  prompt: string;
}

/** Real Red Team Arena, attack-generation half (FORGEFLOW_V3_SPEC.md §7,
 * §25/§26): a single fast Redcap MODE:ATTACK call, tailored to the target
 * agent's real role/instructions. Split from judging so the frontend can
 * render all 5 attack cards immediately, then fill in verdicts one at a
 * time via judgeRedTeam() as each real chat+judge round-trip resolves —
 * restoring the old static-Arena's live, incremental feel. */
export async function attackRedTeam(
  userId: string,
  agentId: string
): Promise<{ prompts: RedTeamAttack[]; agentVersion: number }> {
  const res = await fetch(`${API_URL}/api/redteam/attack/${agentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  return handle<{ prompts: RedTeamAttack[]; agentVersion: number }>(res);
}

/** One real prompt -> real target chat -> real Redcap judgment -> one
 * stored, version-tagged row. Call once per attack, sequentially, to
 * reproduce the old live per-attack update. */
export async function judgeRedTeam(
  userId: string,
  agentId: string,
  attack: RedTeamAttack
): Promise<{ result: RedTeamResult; agentVersion: number; newAchievements: string[] }> {
  const res = await fetch(`${API_URL}/api/redteam/judge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, agentId, prompt: attack.prompt, category: attack.category }),
  });
  return handle<{ result: RedTeamResult; agentVersion: number; newAchievements: string[] }>(res);
}

export interface RedTeamHistoryRow extends RedTeamResult {
  id: string;
  agent_id: string;
  agent_version: number;
  run_at: string;
}

export async function getRedTeamHistory(agentId: string): Promise<RedTeamHistoryRow[]> {
  const res = await fetch(`${API_URL}/api/redteam/${agentId}/history`);
  return handle<RedTeamHistoryRow[]>(res);
}

export async function getAgent(userId: string, agentId: string): Promise<ApiForgedAgent> {
  const res = await fetch(`${API_URL}/api/agents/${userId}/${agentId}`);
  return handle<ApiForgedAgent>(res);
}

/** Real deletion — real Lyzr DELETE, real forged_agents + dependent-row
 * removal (row: new capability). Blocked server-side (409) if this agent
 * is a real Crew member or orchestrator. */
export async function deleteAgent(userId: string, agentId: string): Promise<{ deleted: true; id: string }> {
  const res = await fetch(`${API_URL}/api/agents/${userId}/${agentId}`, { method: "DELETE" });
  return handle<{ deleted: true; id: string }>(res);
}

export interface ProgressState {
  displayName: string | null;
  xp: number;
  rank: string;
  streak: number;
  completedMissions: string[];
  unlockedCampaigns: string[];
  achievements: string[];
  /** In-progress guided-build resume state — null/0/{} when nothing is
   * mid-build (either never started, or already shipped). */
  activeCampaignId: string | null;
  currentMissionIndex: number;
  slotValues: Record<string, string>;
  buildTimerSeconds: number;
}

export async function getProgress(userId: string): Promise<ProgressState> {
  const res = await fetch(`${API_URL}/api/progress/${userId}`);
  return handle<ProgressState>(res);
}

export async function saveProgress(
  userId: string,
  payload: Partial<Omit<ProgressState, "rank">>,
  /** keepalive: true lets this request survive the page unloading — used
   * to flush a pending debounced autosave from a pagehide/beforeunload
   * handler, where a normal fetch would otherwise be aborted mid-flight. */
  opts?: { keepalive?: boolean }
): Promise<ProgressState & { newAchievements: string[] }> {
  const res = await fetch(`${API_URL}/api/progress/${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: opts?.keepalive ?? false,
  });
  return handle<ProgressState & { newAchievements: string[] }>(res);
}

/** No-password "login" — resolves a typed email to a stable account id
 * server-side and returns that account's full progress in one round
 * trip, so the caller can hydrate the store immediately. */
export async function loginOrCreateUser(
  email: string
): Promise<{ userId: string } & ProgressState> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return handle<{ userId: string } & ProgressState>(res);
}

export interface MentorChatResponse {
  response: string;
  newAchievements: string[];
}

export async function chatWithMentor(
  message: string,
  context: string,
  userId: string,
  sessionId: string,
  /** Real internal forged_agents id — when set, the backend injects that
   * agent's real config/forge-score into the turn on top of the platform
   * doc grounding (FORGEFLOW_V3_SPEC.md §8). */
  agentId?: string | null
): Promise<MentorChatResponse> {
  const res = await fetch(`${API_URL}/api/mentor/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, context, userId, sessionId, agentId: agentId ?? undefined }),
  });
  return handle<MentorChatResponse>(res);
}

export interface ReforgePayload {
  updatedSlots: Record<string, string>;
  instructions: string;
  model: string;
  temperature: number;
  estimateMin: number;
}

export async function reforgeAgent(
  userId: string,
  agentId: string,
  payload: ReforgePayload
): Promise<{
  newAgentId: string;
  forgeScore: number;
  version: number;
  lyzrPayload: Record<string, unknown>;
}> {
  const res = await fetch(`${API_URL}/api/agents/${userId}/${agentId}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<{
    newAgentId: string;
    forgeScore: number;
    version: number;
    lyzrPayload: Record<string, unknown>;
  }>(res);
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string | null;
  xp: number;
  rank: string;
  streak: number;
  agentCount: number;
}

export async function getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_URL}/api/leaderboard?limit=${limit}`);
  return handle<LeaderboardEntry[]>(res);
}

export interface KnowledgeDoc {
  id: string;
  agentId: string;
  filename: string;
  chunkCount: number;
  charCount: number;
  uploadedAt: string;
}

/** Text-only ingestion — the backend chunks + embeds `content` and upserts
 * it into that agent's Qdrant collection. `topK` rides along as forward
 * -compatible metadata; retrieval depth is still fixed server-side. */
export async function uploadKnowledge(
  agentId: string,
  payload: { filename: string; content: string; topK?: number }
): Promise<KnowledgeDoc> {
  const res = await fetch(`${API_URL}/api/knowledge/upload/${agentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<KnowledgeDoc>(res);
}

export async function listKnowledgeDocs(agentId: string): Promise<KnowledgeDoc[]> {
  const res = await fetch(`${API_URL}/api/knowledge/${agentId}`);
  return handle<KnowledgeDoc[]>(res);
}

export async function deleteKnowledgeDoc(
  agentId: string,
  docId: string
): Promise<{ deleted: boolean; id: string }> {
  const res = await fetch(`${API_URL}/api/knowledge/${agentId}/${docId}`, {
    method: "DELETE",
  });
  return handle<{ deleted: boolean; id: string }>(res);
}

export interface ApiToolDef {
  id: string;
  agentId: string;
  toolName: string;
  description: string;
  paramsSchema: Record<string, string>;
  endpointUrl: string;
  createdAt: string;
}

/** Register a tool on an already-shipped agent. Note: for the contract to
 * take effect the agent's instructions must mention it — attaching tools
 * at build time (via createAgent's `tools`) is the path that bakes the
 * contract in; this route is the standalone registry endpoint (§9). */
export async function registerTool(
  agentId: string,
  payload: { toolName: string; description: string; paramsSchema: Record<string, string>; endpointUrl: string }
): Promise<ApiToolDef> {
  const res = await fetch(`${API_URL}/api/tools/${agentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<ApiToolDef>(res);
}

export async function listTools(agentId: string): Promise<ApiToolDef[]> {
  const res = await fetch(`${API_URL}/api/tools/${agentId}`);
  return handle<ApiToolDef[]>(res);
}

export async function deleteTool(
  agentId: string,
  toolId: string
): Promise<{ deleted: boolean; id: string }> {
  const res = await fetch(`${API_URL}/api/tools/${agentId}/${toolId}`, { method: "DELETE" });
  return handle<{ deleted: boolean; id: string }>(res);
}
