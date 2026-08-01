export type ParamType = "string" | "number" | "boolean";

/** A real tool the agent can call mid-conversation via the TOOL_CALL loop
 * (FORGEFLOW_V3_SPEC.md §5). Sent with POST /api/agent/create; the backend
 * bakes a contract into agent_instructions and persists it to tool_defs. */
export interface ToolDef {
  name: string;
  description: string;
  /** paramName → declared type. Drives arg validation server-side. */
  paramsSchema: Record<string, ParamType>;
  /** A real webhook URL, or the "builtin:weather" sentinel. */
  endpointUrl: string;
}

export const BUILTIN_WEATHER = "builtin:weather";

/** Prefill for the one live built-in tool (open-meteo, no API key). */
export function weatherToolPreset(): ToolDef {
  return {
    name: "get_weather",
    description: "Look up the current weather for a city",
    paramsSchema: { city: "string" },
    endpointUrl: BUILTIN_WEATHER,
  };
}

export interface AgentKnowledgeDraft {
  /** Chunks retrieved per query. Collected here for the eventual real
   * upload (KnowledgeUploadForm, reused post-ship) and shown in the
   * generated chat_handler.py — not yet wired to server-side retrieval
   * depth, which is fixed at top_k=5. */
  topK: number;
}

/** The in-progress state of a freeform agent build — everything needed
 * to render the live code panel and, on Ship, to build the real
 * POST /api/agent/create payload. Mirrors CreateAgentPayload's shape
 * rather than duplicating a different one. */
export interface AgentDraft {
  name: string;
  role: string;
  goal: string;
  instructions: string;
  model: string;
  /** Derived from `model` (see providerForModel) rather than user-picked
   * — kept as a field because the real Lyzr payload includes provider_id. */
  provider: string;
  temperature: number;
  knowledge?: AgentKnowledgeDraft;
  tools?: ToolDef[];
}

export function providerForModel(model: string): string {
  if (model.startsWith("gemini")) return "google";
  if (model.startsWith("gpt") || model.startsWith("o1") || model.startsWith("o3")) return "openai";
  if (model.startsWith("claude")) return "anthropic";
  return "openai";
}

export const FREEFORM_MODELS = [
  { value: "gemini-2.5-flash", label: "gemini-2.5-flash", note: "fast, cheap — good default" },
  { value: "gemini-2.5-pro", label: "gemini-2.5-pro", note: "slower, stronger reasoning" },
  { value: "gpt-4o-mini", label: "gpt-4o-mini", note: "OpenAI, fast + cheap" },
] as const;

export function blankDraft(): AgentDraft {
  return {
    name: "",
    role: "",
    goal: "",
    instructions: "",
    model: "gemini-2.5-flash",
    provider: "google",
    temperature: 0.3,
    knowledge: { topK: 4 },
    tools: [],
  };
}
