import type { AgentDraft } from "./types";
import { providerForModel } from "./types";

// These three mirror the exact fallbacks backend/src/services/lyzr.ts applies
// when role/goal/description are omitted — shown here so the code panel
// never claims a value was sent when it wasn't.
const DEFAULT_DESCRIPTION = "RAG agent built in ForgeFlow";
const DEFAULT_ROLE = "customer support assistant";
const DEFAULT_GOAL = "Answer customer questions using retrieved docs";

export function effectiveRole(draft: AgentDraft): string {
  return draft.role.trim() || DEFAULT_ROLE;
}
export function effectiveGoal(draft: AgentDraft): string {
  return draft.goal.trim() || DEFAULT_GOAL;
}
export function effectiveDescription(): string {
  return DEFAULT_DESCRIPTION;
}

function pyLine(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}
function pyTriple(s: string): string {
  return `"""${s.replace(/"""/g, '\\"\\"\\"')}"""`;
}

/** The literal request ForgeFlow sends to POST /v3/agents/ on Ship — kept
 * in lockstep with backend/src/services/lyzr.ts's createLyzrAgent(). No
 * retriever/search_kwargs here: agent creation and retrieval are two
 * separate operations (see qdrant_setup.py / chat_handler.py below). */
export function generateAgentPy(draft: AgentDraft): string {
  const provider = providerForModel(draft.model);
  const instructions = draft.instructions.trim() || "# (write instructions in Phase 2 — Instructions)";
  const hasTools = (draft.tools?.length ?? 0) > 0;
  // Accuracy (§5b): when tools are attached the backend concatenates the
  // TOOL_CALL contract onto agent_instructions before the create call, so
  // the panel must show that concatenation, not the bare instructions.
  const instructionsField = hasTools
    ? `${pyTriple(instructions)} + TOOL_CONTRACT,  # tool contract appended at creation — see tool_handler.py`
    : `${pyTriple(instructions)},`;

  return `import requests

payload = {
    "name": ${pyLine(draft.name.trim() || "Untitled Agent")},
    "description": ${pyLine(effectiveDescription())},
    "agent_role": ${pyLine(effectiveRole(draft))},
    "agent_instructions": ${instructionsField}
    "agent_goal": ${pyLine(effectiveGoal(draft))},
    "provider_id": ${pyLine(provider)},
    "model": ${pyLine(draft.model)},
    "temperature": ${draft.temperature},
    "top_p": 1,
    "store_messages": True,
}

response = requests.post(
    "https://agent-prod.studio.lyzr.ai/v3/agents/",
    headers={"x-api-key": LYZR_API_KEY, "Content-Type": "application/json"},
    json=payload,
)
agent_id = response.json()["agent_id"]`;
}

/** Python-flavored port of backend/src/services/qdrant.ts — same
 * collection-naming scheme, same payload index (required by this
 * cluster's strict mode for filtered deletes), same functions. */
export function generateQdrantSetupPy(draft: AgentDraft): string {
  const topK = draft.knowledge?.topK ?? 4;
  return `from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

def collection_name(agent_id: str) -> str:
    return f"agent_{agent_id}"

def ensure_collection(agent_id: str):
    name = collection_name(agent_id)
    if not client.collection_exists(name):
        client.create_collection(
            name, vectors_config=VectorParams(size=768, distance=Distance.COSINE)
        )
    # this cluster runs in strict mode — filtering by docId (used to
    # delete one doc's chunks without touching the rest) needs an index
    client.create_payload_index(name, field_name="docId", field_schema="keyword")

def upsert_chunks(agent_id: str, chunks: list[dict]):
    ensure_collection(agent_id)
    client.upsert(collection_name(agent_id), points=[
        PointStruct(
            id=c["id"],
            vector=c["vector"],
            payload={
                "text": c["text"],
                "docId": c["docId"],
                "filename": c["filename"],
                "chunkIndex": c["chunkIndex"],
            },
        )
        for c in chunks
    ])

def search(agent_id: str, query_vector: list[float], top_k: int = ${topK}):
    name = collection_name(agent_id)
    if not client.collection_exists(name):
        return []
    return client.search(name, query_vector=query_vector, limit=top_k)`;
}

/** Port of the retrieval branch inside backend/src/routes/agent.ts's
 * /chat handler — a separate real operation from agent creation, run on
 * every message, not just once at Ship time. top_k is fixed server-side
 * for now (not yet wired to the topK collected in Phase 4). */
export function generateChatHandlerPy(): string {
  return `def handle_chat(agent_id: str, message: str, session_id: str) -> str:
    """Runs on every chat message — separate from agent creation above.
    Only retrieves if this agent has ingested knowledge docs."""
    if count_knowledge_docs(agent_id) == 0:
        return call_lyzr_chat(agent_id, message, session_id)

    query_vector = embed_text(message)               # gemini-embedding-001, 768-dim
    chunks = search(agent_id, query_vector, top_k=5)  # fixed server-side for now
    if not chunks:
        return call_lyzr_chat(agent_id, message, session_id)

    context = "\\n\\n".join(f"[{i + 1}] {c.text}" for i, c in enumerate(chunks))
    grounded_message = (
        "Use the following retrieved context to answer the question. "
        "If the context does not contain the answer, say so instead of guessing.\\n\\n"
        f"Context:\\n{context}\\n\\nQuestion: {message}"
    )
    return call_lyzr_chat(agent_id, grounded_message, session_id)`;
}

/** Port of the real tool loop in backend/src/services/tools.ts +
 * routes/agent.ts (FORGEFLOW_V3_SPEC.md §5). Shows the exact contract the
 * agent's instructions carry, the TOOL_CALL marker parse, the real HTTP
 * execution, and feeding the result back into the same Lyzr session.
 * Reflects the tools actually attached to this draft. */
export function generateToolHandlerPy(draft: AgentDraft): string {
  const tools = draft.tools ?? [];
  const toolLines =
    tools.length > 0
      ? tools
          .map((t) => {
            const params =
              Object.entries(t.paramsSchema)
                .map(([k, v]) => `${k} (${v})`)
                .join(", ") || "none";
            return `#   - ${t.name}: ${t.description}. Parameters: ${params}. -> ${t.endpointUrl}`;
          })
          .join("\n")
      : "#   (no tools attached yet — add one in Phase 5)";

  return `# Tools attached to this agent:
${toolLines}

# Appended to agent_instructions at creation (this is TOOL_CONTRACT in agent.py):
TOOL_CONTRACT = (
    "\\n\\nYou have access to these tools: ...\\n"
    'When you need a tool, respond with EXACTLY:\\n'
    'TOOL_CALL: {"tool": "<tool_name>", "args": { ... }}\\n'
    "and nothing else in that turn."
)

def handle_chat_with_tools(agent_id, session_id, response):
    """Runs after the first Lyzr reply. No-op unless the agent has tools
    AND the reply carries a TOOL_CALL marker."""
    for _ in range(4):  # safety cap on tool rounds
        call = parse_tool_call(response)          # find TOOL_CALL: {...}
        if call is None:
            return response                        # plain answer — done

        tool = lookup_tool(agent_id, call["tool"])
        err = validate_args(tool["params_schema"], call["args"])
        if err:
            response = lyzr_chat(agent_id, f"TOOL_ERROR: {err}", session_id)
            continue

        # real HTTP call — open-meteo for builtin:weather, else POST the webhook
        result = execute_tool(tool["endpoint_url"], call["args"])

        # feed the real result back into the SAME session, get the final answer
        follow_up = f"TOOL_RESULT for {call['tool']}: {json.dumps(result)}"
        response = lyzr_chat(agent_id, follow_up, session_id)
    return response`;
}
