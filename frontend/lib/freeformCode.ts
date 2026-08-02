import { BUILTIN_WEATHER, FREEFORM_MODELS, providerForModel, blankToolDraft, type AgentDraft, type ParamType } from "./types";
import { lintField, type FieldKey, type LintCtx, type SlotState } from "./freeformLint";

/** An inline, editable slot inside the code — a real <input>/<select> that
 * binds two-way to the AgentDraft (FIX 1). `field` says which value it
 * reads/writes and which lint rule/lock-state governs it; the numeric
 * fields (temperature, topK) round-trip through the screen's raw-string
 * state so invalid typed input can be validated.
 *
 * `value`/`onChange`/`state`/`locked` are overrides for a repeating row
 * that isn't a single top-level AgentDraft key (an already-attached tool,
 * FIX 2) — same lint rule and rendering, just pointed at a different real
 * value than draft[field]. Omitted for every plain top-level field, which
 * keeps deriving straight from the draft as before. */
export interface CodeSlot {
  field: Extract<
    FieldKey,
    | "name"
    | "role"
    | "goal"
    | "instructions"
    | "model"
    | "temperature"
    | "topK"
    | "toolDraftName"
    | "toolDraftDescription"
    | "toolDraftEndpoint"
    | "crewRoleLabel"
  >;
  kind: "input" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
  size?: number;
  value?: string;
  onChange?: (v: string) => void;
  state?: SlotState;
  locked?: boolean;
  rowKey?: string;
}

/** A real, clickable action embedded in the code text — "+ attach tool" /
 * "× remove" (FIX 2). Styled inline like the rest of the editor, not a
 * separate form control. */
export interface CodeAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "attach" | "remove";
  key?: string;
}

export type CodeSegment = { html: string } | { slot: CodeSlot } | { action: CodeAction };

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

/** Parses "key:type, key2:type2" into a real ParamsSchema — the simplest
 * inline-text representation of a param list that still round-trips into
 * exactly the Record<string, ParamType> shape backend/src/services/
 * tools.ts expects. Silently skips a malformed pair rather than blocking
 * (params are genuinely optional — a tool can take none). */
function parseParamsString(raw: string): Record<string, ParamType> {
  const schema: Record<string, ParamType> = {};
  for (const pair of raw.split(",")) {
    const [rawKey, rawType] = pair.split(":").map((s) => s.trim());
    if (!rawKey) continue;
    const t = (rawType || "string") as ParamType;
    if (t === "string" || t === "number" || t === "boolean") schema[rawKey] = t;
  }
  return schema;
}

function toolFieldValid(field: "toolDraftName" | "toolDraftDescription" | "toolDraftEndpoint", ctx: LintCtx): SlotState {
  const line = lintField(field, ctx);
  if (line.blocking && !line.ok) return "empty";
  if (line.warn) return "warn";
  return "ok";
}

/** The real tool_handler.py view — the exact TOOL_CALL loop (unchanged,
 * read-only, ported from backend/src/services/tools.ts + routes/agent.ts),
 * plus real inline slots for every already-attached tool (two-way bound
 * straight to draft.tools[i], with a real "× remove") and one more set of
 * slots for the next tool being defined, ending in a real "+ attach tool"
 * that only enables once its fields pass the same lint agent.py's fields
 * use (FIX 2 — replaces the standalone ToolsEditor form entirely). */
export function toolHandlerSegments(
  draft: AgentDraft,
  update: (patch: Partial<AgentDraft>) => void,
  onFieldEdit: (field: FieldKey) => void
): CodeSegment[] {
  const tools = draft.tools ?? [];
  const ctx: LintCtx = { draft, rawTemp: "", rawTopK: "" };
  const segs: CodeSegment[] = [];

  segs.push({
    html:
      `${cmt("# Tools attached to this agent — each row is real and editable:")}\n` +
      `TOOLS = [${tools.length === 0 ? cmt("  # (none yet — define one below)") : ""}\n`,
  });

  tools.forEach((t, i) => {
    const setField =
      (field: "name" | "description" | "endpointUrl") =>
      (v: string) => {
        update({ tools: tools.map((row, j) => (j === i ? { ...row, [field]: v } : row)) });
      };
    segs.push({ html: `    {${str('"name"')}: ` });
    segs.push({
      slot: {
        field: "toolDraftName",
        kind: "input",
        size: Math.max(10, t.name.length),
        value: t.name,
        onChange: setField("name"),
        state: /^[a-zA-Z0-9_]+$/.test(t.name) ? "ok" : "empty",
        locked: false,
        rowKey: `tool-${i}-name`,
      },
    });
    segs.push({ html: `, ${str('"description"')}: ` });
    segs.push({
      slot: {
        field: "toolDraftDescription",
        kind: "input",
        size: Math.max(18, t.description.length),
        value: t.description,
        onChange: setField("description"),
        state: t.description.trim().length >= 8 ? "ok" : "warn",
        locked: false,
        rowKey: `tool-${i}-desc`,
      },
    });
    segs.push({ html: `, ${str('"endpoint"')}: ` });
    segs.push({
      slot: {
        field: "toolDraftEndpoint",
        kind: "input",
        size: Math.max(14, t.endpointUrl.length),
        value: t.endpointUrl,
        onChange: setField("endpointUrl"),
        state:
          t.endpointUrl === BUILTIN_WEATHER || /^https?:\/\//.test(t.endpointUrl) ? "ok" : "empty",
        locked: t.endpointUrl === BUILTIN_WEATHER, // built-in stays the real sentinel, not freely rewritable into garbage
        rowKey: `tool-${i}-endpoint`,
      },
    });
    segs.push({ html: `}` });
    segs.push({
      action: {
        label: "× remove",
        tone: "remove",
        key: `remove-${i}`,
        onClick: () => update({ tools: tools.filter((_, j) => j !== i) }),
      },
    });
    segs.push({ html: `,\n` });
  });

  segs.push({ html: `]\n\n${cmt("# + define a new tool below, then attach it:")}\nNEW_TOOL = {${str('"name"')}: ` });
  segs.push({
    slot: {
      field: "toolDraftName",
      kind: "input",
      placeholder: "get_weather",
      size: 16,
      state: toolFieldValid("toolDraftName", ctx),
    },
  });
  segs.push({ html: `, ${str('"description"')}: ` });
  segs.push({
    slot: {
      field: "toolDraftDescription",
      kind: "input",
      placeholder: "what it does and when to use it",
      size: 30,
      state: toolFieldValid("toolDraftDescription", ctx),
    },
  });
  segs.push({ html: `, ${str('"kind"')}: ` });
  segs.push({
    slot: {
      field: "toolDraftEndpoint", // owning-mission (toolWire) reused for lock state; value/onChange point at toolDraftKind instead
      kind: "select",
      value: draft.toolDraftKind ?? "weather",
      onChange: (v) => {
        const kind = v === "webhook" ? "webhook" : "weather";
        if (kind === "weather") {
          const preset = blankToolDraft();
          update({ toolDraftKind: kind, toolDraftEndpoint: preset.toolDraftEndpoint, toolDraftParams: preset.toolDraftParams });
        } else {
          update({ toolDraftKind: kind, toolDraftEndpoint: "" });
        }
      },
      state: "ok",
      locked: false,
      options: [
        { value: "weather", label: '"builtin:weather"' },
        { value: "webhook", label: '"webhook"' },
      ],
    },
  });
  segs.push({ html: `, ${str('"endpoint"')}: ` });
  segs.push({
    slot: {
      field: "toolDraftEndpoint",
      kind: "input",
      placeholder: "https://your-service.example.com/hook",
      size: 26,
      value: draft.toolDraftKind === "weather" ? BUILTIN_WEATHER : (draft.toolDraftEndpoint ?? ""),
      onChange: (v) => update({ toolDraftEndpoint: v }),
      locked: draft.toolDraftKind === "weather",
      state: toolFieldValid("toolDraftEndpoint", ctx),
    },
  });
  segs.push({ html: `, ${str('"params"')}: ` });
  segs.push({
    slot: {
      field: "toolDraftEndpoint", // same owning mission (toolWire) — params are part of "wiring" the call
      kind: "input",
      placeholder: "city:string",
      size: 18,
      value: draft.toolDraftKind === "weather" ? "city:string" : (draft.toolDraftParams ?? ""),
      onChange: (v) => update({ toolDraftParams: v }),
      locked: draft.toolDraftKind === "weather",
      state: "ok",
    },
  });
  segs.push({ html: `}\n` });

  const nameLine = lintField("toolDraftName", ctx);
  const descLine = lintField("toolDraftDescription", ctx);
  const endpointLine = lintField("toolDraftEndpoint", ctx);
  const canAttach = nameLine.ok && descLine.ok && endpointLine.ok;

  segs.push({
    action: {
      label: "+ attach tool",
      tone: "attach",
      key: "attach",
      disabled: !canAttach,
      onClick: () => {
        if (!canAttach) return;
        const paramsSchema =
          draft.toolDraftKind === "weather" ? { city: "string" as ParamType } : parseParamsString(draft.toolDraftParams ?? "");
        const newTool = {
          name: (draft.toolDraftName ?? "").trim(),
          description: (draft.toolDraftDescription ?? "").trim(),
          paramsSchema,
          endpointUrl: draft.toolDraftKind === "weather" ? BUILTIN_WEATHER : (draft.toolDraftEndpoint ?? "").trim(),
        };
        update({ tools: [...tools, newTool], ...blankToolDraft() });
        onFieldEdit("toolDraftName");
      },
    },
  });

  // The real ReAct-style loop these attached tools actually run through
  // (backend/src/services/tools.ts + routes/agent.ts, §5) — read-only,
  // since it's genuinely the same code regardless of which tools exist.
  segs.push({
    html:
      `\n\n${cmt("# Appended to agent_instructions at creation (this is TOOL_CONTRACT in agent.py):")}\n` +
      `TOOL_CONTRACT = (\n` +
      `    "\\n\\nYou have access to these tools: ...\\n"\n` +
      `    'When you need a tool, respond with EXACTLY:\\n'\n` +
      `    'TOOL_CALL: {${str('"tool"')}: "<tool_name>", ${str('"args"')}: { ... }}\\n'\n` +
      `    "and nothing else in that turn."\n` +
      `)\n\n` +
      `${kw("def")} ${fn("handle_chat_with_tools")}(agent_id, session_id, response):\n` +
      `    ${str('"""Runs after the first Lyzr reply. No-op unless the agent has tools\n    AND the reply carries a TOOL_CALL marker."""')}\n` +
      `    ${kw("for")} _ ${kw("in")} ${fn("range")}(${num("4")}):  ${cmt("# safety cap on tool rounds")}\n` +
      `        call = ${fn("parse_tool_call")}(response)          ${cmt("# find TOOL_CALL: {...}")}\n` +
      `        ${kw("if")} call ${kw("is")} ${kw("None")}:\n` +
      `            ${kw("return")} response                        ${cmt("# plain answer — done")}\n\n` +
      `        tool = ${fn("lookup_tool")}(agent_id, call[${str('"tool"')}])\n` +
      `        err = ${fn("validate_args")}(tool[${str('"params_schema"')}], call[${str('"args"')}])\n` +
      `        ${kw("if")} err:\n` +
      `            response = ${fn("lyzr_chat")}(agent_id, ${str('f"TOOL_ERROR: {err}"')}, session_id)\n` +
      `            ${kw("continue")}\n\n` +
      `        ${cmt("# real HTTP call — open-meteo for builtin:weather, else POST the webhook")}\n` +
      `        result = ${fn("execute_tool")}(tool[${str('"endpoint_url"')}], call[${str('"args"')}])\n\n` +
      `        ${cmt("# feed the real result back into the SAME session, get the final answer")}\n` +
      `        follow_up = ${str("f\"TOOL_RESULT for {call['tool']}: {json.dumps(result)}\"")}\n` +
      `        response = ${fn("lyzr_chat")}(agent_id, follow_up, session_id)\n` +
      `    ${kw("return")} response`,
  });

  return segs;
}

/** Crew's "Define the Crew" step (FIX 3) as real inline code-editor slots
 * inside crew_config.py — same real mechanism as tool_handler.py's rows
 * above, just for a plain string[] (role labels) instead of AgentDraft.
 * `field: "crewRoleLabel"` is never actually looked up against a draft —
 * every slot here carries its own value/onChange/state (the same override
 * pattern the repeating tool rows use), so CodePanel's shared InlineSlot
 * component works unmodified for a screen that has no AgentDraft at all. */
export function crewDefineSegments(
  roleLabels: string[],
  setRoleLabels: (labels: string[]) => void
): CodeSegment[] {
  const segs: CodeSegment[] = [
    {
      html:
        `${cmt("# One row per specialist — the role label is what the orchestrator")}\n` +
        `${cmt("# routes on later (see orchestrator.py's ROUTE_TO logic).")}\n` +
        `CREW_MEMBERS = [${roleLabels.length === 0 ? cmt("  # (none yet — add one below)") : ""}\n`,
    },
  ];

  roleLabels.forEach((label, i) => {
    segs.push({ html: `    {${str('"role_label"')}: ` });
    segs.push({
      slot: {
        field: "crewRoleLabel",
        kind: "input",
        size: Math.max(16, label.length),
        value: label,
        onChange: (v) => setRoleLabels(roleLabels.map((r, j) => (j === i ? v : r))),
        state: label.trim().length > 0 ? "ok" : "empty",
        locked: false,
        placeholder: i === 0 ? "Billing Specialist" : "Technical Specialist",
        rowKey: `role-${i}`,
      },
    });
    segs.push({ html: `}` });
    if (roleLabels.length > 1) {
      segs.push({
        action: {
          label: "× remove",
          tone: "remove",
          key: `remove-role-${i}`,
          onClick: () => setRoleLabels(roleLabels.filter((_, j) => j !== i)),
        },
      });
    }
    segs.push({ html: `,\n` });
  });

  segs.push({ html: `]\n\n` });
  segs.push({
    action: {
      label: "+ specialist",
      tone: "attach",
      key: "add-role",
      onClick: () => setRoleLabels([...roleLabels, ""]),
    },
  });

  return segs;
}
