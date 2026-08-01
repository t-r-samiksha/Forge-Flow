import { FREEFORM_MODELS, providerForModel, type AgentDraft } from "./types";
import type { FieldKey } from "./freeformLint";

/** An inline, editable slot inside the code — a real <input>/<select> that
 * binds two-way to the AgentDraft (FIX 1). `field` says which value it
 * reads/writes; the numeric fields (temperature, topK) round-trip through
 * the screen's raw-string state so invalid typed input can be validated. */
export interface CodeSlot {
  field: Extract<FieldKey, "name" | "role" | "goal" | "instructions" | "model" | "temperature" | "topK">;
  kind: "input" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
  size?: number;
}

export type CodeSegment = { html: string } | { slot: CodeSlot };

// syntax-A span helpers (resolve to the legacy build-editor palette when
// rendered outside .learn-snippet)
const kw = (s: string) => `<span class="kw">${s}</span>`;
const str = (s: string) => `<span class="str">${s}</span>`;
const num = (s: string) => `<span class="num">${s}</span>`;
const fn = (s: string) => `<span class="fn">${s}</span>`;
const cmt = (s: string) => `<span class="cmt">${s}</span>`;

/** The real POST /v3/agents/ payload as editable code (§5b: only what's
 * actually sent — no retriever=/search_kwargs=). name/role/goal/
 * instructions/model/temperature are inline slots; everything else is the
 * literal request. */
export function agentPySegments(draft: AgentDraft): CodeSegment[] {
  const provider = providerForModel(draft.model);
  const hasTools = (draft.tools?.length ?? 0) > 0;
  return [
    { html: `${kw("import")} requests\n\npayload = {\n    ${str('"name"')}: ` },
    { slot: { field: "name", kind: "input", placeholder: "name the agent…", size: 22 } },
    { html: `,\n    ${str('"description"')}: ${str('"RAG agent built in ForgeFlow"')},\n    ${str('"agent_role"')}: ` },
    { slot: { field: "role", kind: "input", placeholder: "e.g. billing support assistant", size: 26 } },
    { html: `,\n    ${str('"agent_instructions"')}: ` },
    { slot: { field: "instructions", kind: "input", placeholder: "write the instruction…", size: 40 } },
    {
      html:
        `,${hasTools ? "  " + cmt("# + TOOL_CONTRACT appended at ship") : ""}` +
        `\n    ${str('"agent_goal"')}: `,
    },
    { slot: { field: "goal", kind: "input", placeholder: "one sentence: what “done” looks like", size: 30 } },
    { html: `,\n    ${str('"provider_id"')}: ${str(`"${provider}"`)},\n    ${str('"model"')}: ` },
    {
      slot: {
        field: "model",
        kind: "select",
        // Leading blank option so a cloned template (or a fresh draft that
        // hasn't picked yet) shows "Choose model…" rather than a pre-selected
        // default the developer never actively chose (FIX 2). It reads as
        // blocking until a real model is selected.
        options: [
          { value: "", label: "Choose model…" },
          ...FREEFORM_MODELS.map((m) => ({ value: m.value, label: `"${m.value}"` })),
        ],
      },
    },
    { html: `,\n    ${str('"temperature"')}: ` },
    { slot: { field: "temperature", kind: "input", placeholder: "0.0–1.0", size: 5 } },
    {
      html:
        `,\n    ${str('"top_p"')}: ${num("1")},\n    ${str('"store_messages"')}: ${kw("True")},\n}\n\n` +
        `response = requests.${fn("post")}(\n    ${str('"https://agent-prod.studio.lyzr.ai/v3/agents/"')},\n` +
        `    headers={${str('"x-api-key"')}: LYZR_API_KEY},\n    json=payload,\n)\nagent_id = response.${fn("json")}()[${str('"agent_id"')}]`,
    },
  ];
}

/** Python-flavored view of the real qdrant.ts service, with top_k as the
 * one inline slot. The collection is shown derived (agent_<id>) — never a
 * user-typed name, since qdrant.ts always names it after the agent_id
 * (the §5b lesson: don't invite a fictional collection). Stays unlocked. */
export function qdrantSetupSegments(): CodeSegment[] {
  return [
    {
      html:
        `${kw("from")} qdrant_client ${kw("import")} QdrantClient\n` +
        `client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)\n\n` +
        `${kw("def")} ${fn("collection_name")}(agent_id):\n` +
        `    ${kw("return")} ${str('f"agent_{agent_id}"')}          ${cmt("# this agent's real collection")}\n\n` +
        `${kw("def")} ${fn("ensure_collection")}(agent_id):\n` +
        `    name = ${fn("collection_name")}(agent_id)\n` +
        `    ${kw("if")} ${kw("not")} client.${fn("collection_exists")}(name):\n` +
        `        client.${fn("create_collection")}(name, vectors_config=VectorParams(size=${num("768")}, distance=Distance.COSINE))\n` +
        `    client.${fn("create_payload_index")}(name, field_name=${str('"docId"')}, field_schema=${str('"keyword"')})\n\n` +
        `${kw("def")} ${fn("search")}(agent_id, query_vector, top_k=`,
    },
    { slot: { field: "topK", kind: "input", placeholder: "3–5", size: 4 } },
    {
      html:
        `):\n    ${kw("return")} client.${fn("search")}(${fn("collection_name")}(agent_id), query_vector=query_vector, limit=top_k)`,
    },
  ];
}
