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

export async function getAgent(userId: string, agentId: string): Promise<ApiForgedAgent> {
  const res = await fetch(`${API_URL}/api/agents/${userId}/${agentId}`);
  return handle<ApiForgedAgent>(res);
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
  payload: Partial<Omit<ProgressState, "rank">>
): Promise<ProgressState & { newAchievements: string[] }> {
  const res = await fetch(`${API_URL}/api/progress/${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
  sessionId: string
): Promise<MentorChatResponse> {
  const res = await fetch(`${API_URL}/api/mentor/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, context, userId, sessionId }),
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
