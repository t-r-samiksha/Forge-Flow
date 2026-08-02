const LYZR_BASE = "https://agent-prod.studio.lyzr.ai/v3";

export class LyzrConfigError extends Error {}

function requireApiKey(): string {
  const apiKey = process.env.LYZR_API_KEY;
  if (!apiKey || apiKey === "placeholder_for_now") {
    throw new LyzrConfigError(
      "LYZR_API_KEY is not configured — add a real key to backend/.env"
    );
  }
  return apiKey;
}

export interface CreateAgentConfig {
  name: string;
  description?: string;
  role?: string;
  instructions: string;
  goal?: string;
  providerId?: string;
  model: string;
  temperature: number;
  /** Passed through to the Lyzr payload verbatim when present (e.g.
   * tool/function-calling config). Never set for Retriever, so its
   * payload shape is unaffected. */
  extraFeatures?: Record<string, unknown>;
}

function inferProviderId(model: string): string {
  if (model.startsWith("gemini")) return "google";
  if (model.startsWith("gpt") || model.startsWith("o1") || model.startsWith("o3")) return "openai";
  if (model.startsWith("claude")) return "anthropic";
  return "openai";
}

export async function createLyzrAgent(
  config: CreateAgentConfig
): Promise<{ agentId: string; payload: Record<string, unknown> }> {
  const apiKey = requireApiKey();
  const payload = {
    name: config.name,
    description: config.description ?? "RAG agent built in ForgeFlow",
    agent_role: config.role ?? "customer support assistant",
    agent_instructions: config.instructions,
    agent_goal: config.goal ?? "Answer customer questions using retrieved docs",
    provider_id: config.providerId ?? inferProviderId(config.model),
    model: config.model,
    temperature: config.temperature,
    top_p: 1,
    store_messages: true,
    ...(config.extraFeatures ?? {}),
  };
  const t0 = Date.now();
  console.log(`[lyzr] -> POST ${LYZR_BASE}/agents/`);
  console.log(JSON.stringify(payload, null, 2));
  const res = await fetch(`${LYZR_BASE}/agents/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.log(`[lyzr] <- ${res.status} in ${Date.now() - t0}ms — FAILED: ${text}`);
    throw new Error(`Lyzr create agent failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { agent_id: string };
  console.log(`[lyzr] <- ${res.status} in ${Date.now() - t0}ms — agent_id=${data.agent_id}`);
  return { agentId: data.agent_id, payload };
}

/** Real DELETE /v3/agents/:id — used by DELETE /api/agents/:userId/:agentId
 * (row: real agent deletion). A 404 from Lyzr (agent already gone, e.g. a
 * prior failed retry) is treated as success — the end state is the same,
 * nothing left to delete on Lyzr's side. Any other non-2xx is a real failure. */
export async function deleteLyzrAgent(lyzrAgentId: string): Promise<void> {
  const apiKey = requireApiKey();
  const t0 = Date.now();
  console.log(`[lyzr] -> DELETE ${LYZR_BASE}/agents/${lyzrAgentId}`);
  const res = await fetch(`${LYZR_BASE}/agents/${lyzrAgentId}`, {
    method: "DELETE",
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    console.log(`[lyzr] <- ${res.status} in ${Date.now() - t0}ms — FAILED: ${text}`);
    throw new Error(`Lyzr delete agent failed (${res.status}): ${text}`);
  }
  console.log(`[lyzr] <- ${res.status} in ${Date.now() - t0}ms — deleted agentId=${lyzrAgentId}`);
}

function requireMentorAgentId(): string {
  const agentId = process.env.LYZR_MENTOR_AGENT_ID;
  if (!agentId) {
    throw new LyzrConfigError(
      "LYZR_MENTOR_AGENT_ID is not configured — add the Nova agent ID to backend/.env"
    );
  }
  return agentId;
}

export async function chatWithMentorAgent(
  message: string,
  userId: string,
  sessionId: string
): Promise<{ response: string }> {
  const apiKey = requireApiKey();
  const agentId = requireMentorAgentId();
  const res = await fetch(`${LYZR_BASE}/inference/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      user_id: `forge_user_${userId}`,
      agent_id: agentId,
      session_id: sessionId,
      message,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Lyzr mentor chat failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { response: string };
  return { response: data.response };
}

function requireRedcapAgentId(): string {
  const agentId = process.env.LYZR_REDCAP_AGENT_ID;
  if (!agentId) {
    throw new LyzrConfigError(
      "LYZR_REDCAP_AGENT_ID is not configured — add the Redcap agent ID to backend/.env"
    );
  }
  return agentId;
}

/** Red Team Arena's judge/attack-generator (FORGEFLOW_V3_SPEC.md §7) — one
 * pre-provisioned Lyzr agent with two-mode instructions (MODE:ATTACK /
 * MODE:JUDGE), same fixed-agent_id-in-.env pattern as Nova. */
export async function chatWithRedcapAgent(
  message: string,
  userId: string,
  sessionId: string
): Promise<{ response: string }> {
  const apiKey = requireApiKey();
  const agentId = requireRedcapAgentId();
  const t0 = Date.now();
  console.log(
    `[lyzr] -> POST ${LYZR_BASE}/inference/chat/  (redcap, message="${message.slice(0, 80)}${message.length > 80 ? "…" : ""}")`
  );
  const res = await fetch(`${LYZR_BASE}/inference/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      user_id: `forge_user_${userId}`,
      agent_id: agentId,
      session_id: sessionId,
      message,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.log(`[lyzr] <- ${res.status} in ${Date.now() - t0}ms — FAILED: ${text}`);
    throw new Error(`Lyzr redcap chat failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { response: string };
  console.log(
    `[lyzr] <- ${res.status} in ${Date.now() - t0}ms — "${data.response.slice(0, 80)}${data.response.length > 80 ? "…" : ""}"`
  );
  return { response: data.response };
}

export async function chatWithLyzrAgent(
  agentId: string,
  message: string,
  sessionId: string
): Promise<{ response: string }> {
  const apiKey = requireApiKey();
  const t0 = Date.now();
  console.log(`[lyzr] -> POST ${LYZR_BASE}/inference/chat/  (agent_id=${agentId}, message="${message.slice(0, 60)}${message.length > 60 ? "…" : ""}")`);
  const res = await fetch(`${LYZR_BASE}/inference/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      user_id: "forge_user",
      agent_id: agentId,
      session_id: sessionId,
      message,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.log(`[lyzr] <- ${res.status} in ${Date.now() - t0}ms — FAILED: ${text}`);
    throw new Error(`Lyzr chat failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { response: string };
  console.log(`[lyzr] <- ${res.status} in ${Date.now() - t0}ms — "${data.response.slice(0, 60)}${data.response.length > 60 ? "…" : ""}"`);
  return { response: data.response };
}
