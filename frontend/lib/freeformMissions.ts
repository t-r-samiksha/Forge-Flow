import type { MissionStep } from "./campaigns";
import { lintMission, type LintCtx, type ValidationLine } from "./freeformLint";

export type { ValidationLine } from "./freeformLint";

export type MissionKey =
  | "identity"
  | "instructions"
  | "model"
  | "retrieval"
  | "toolDefine"
  | "toolWire"
  | "ship"
  | "upload";

export type LevelId = "root" | "memory" | "tools" | "deploy";

/** Shared per-mission definition — the single source the Level-intro,
 * mission-overview pre-screen, and editor Situation Report all render from,
 * so sub-step copy and XP can't drift the way the old hardcoded campaign
 * data eventually could. */
export interface FreeformMission {
  key: MissionKey;
  icon: string;
  title: string;
  /** XP awarded on completing this mission — the real value shown on the
   * Level-intro + overview screens and added on the editor's Continue. */
  reward: number;
  railTag: string;
  /** Situation-report / overview copy — general principle framing, no
   * fake company references (spec §3b). */
  sitrepHtml: string;
  /** Sub-steps shown on the overview screen and Build Map hint — describe
   * the very fields the editor collects. */
  steps: MissionStep[];
  optional: boolean;
}

export interface FreeformLevel {
  id: LevelId;
  title: string;
  description: string;
  /** Whether the whole level only appears when the developer opts in
   * (Memory ← Knowledge, Tools ← Tools). */
  optional: boolean;
  missionKeys: MissionKey[];
}

const MISSIONS: Record<MissionKey, FreeformMission> = {
  identity: {
    key: "identity",
    icon: "👤",
    title: "Identity",
    reward: 20,
    railTag: "who the agent is",
    sitrepHtml:
      "Your agent's identity is what Lyzr sees first — the <b>name</b>, the <b>role</b> it plays, and the <b>goal</b> that defines \"done.\" A vague identity produces vague behavior.",
    steps: [
      { label: "Name the agent", sub: "what it's called everywhere it speaks" },
      { label: "Set the role", sub: "the persona sent as agent_role" },
      { label: "Set the goal", sub: "one sentence: what \"done\" looks like" },
    ],
    optional: false,
  },
  instructions: {
    key: "instructions",
    icon: "📝",
    title: "Instructions",
    reward: 25,
    railTag: "how it behaves",
    sitrepHtml:
      "This is the single biggest lever for your agent's behavior — tone, boundaries, what it should refuse. Everything downstream inherits from what you write here.",
    steps: [{ label: "Write the instructions", sub: "tone, boundaries, refusal rules" }],
    optional: false,
  },
  model: {
    key: "model",
    icon: "🎛",
    title: "Model & Tuning",
    reward: 20,
    railTag: "the engine",
    sitrepHtml:
      "Temperature controls output randomness — lower for factual/support agents, higher for creative ones. The model choice trades speed and cost against reasoning depth.",
    steps: [
      { label: "Choose the model", sub: "which Lyzr model this agent runs on" },
      { label: "Set the temperature", sub: "how deterministic answers are" },
    ],
    optional: false,
  },
  retrieval: {
    key: "retrieval",
    icon: "📚",
    title: "Configure Retrieval",
    reward: 35,
    railTag: "grounding",
    sitrepHtml:
      "Knowledge is retrieved per query, not baked in once — <b>top_k</b> controls how many chunks come back each turn. The collection is named after this agent's id, created on ship.",
    steps: [
      { label: "Name the collection", sub: "derived as agent_<id> — created on ship" },
      { label: "Configure top_k", sub: "chunks pulled per query" },
    ],
    optional: true,
  },
  toolDefine: {
    key: "toolDefine",
    icon: "🔧",
    title: "Define a Tool",
    reward: 25,
    railTag: "what it can call",
    sitrepHtml:
      "A tool is a real external action the agent can invoke mid-conversation. Its name and description are what the model routes on; the parameter schema is what it must supply.",
    steps: [
      { label: "Name the tool", sub: "a snake_case identifier" },
      { label: "Describe when to use it", sub: "the router picks tools from this text" },
      { label: "Define parameters", sub: "the args the agent must supply" },
    ],
    optional: true,
  },
  toolWire: {
    key: "toolWire",
    icon: "🔌",
    title: "Wire the Tool",
    reward: 20,
    railTag: "where it calls",
    sitrepHtml:
      "Point the tool at something real — the keyless built-in weather API, or your own webhook. At ship time the TOOL_CALL contract is baked into the agent's instructions so it knows the tool exists.",
    steps: [
      { label: "Choose built-in or webhook", sub: "weather, or a custom URL" },
      { label: "Enter endpoint", sub: "the real URL the backend calls" },
    ],
    optional: true,
  },
  ship: {
    key: "ship",
    icon: "🚀",
    title: "Ship",
    reward: 50,
    railTag: "create the real agent",
    sitrepHtml:
      "Review the exact payload, then create the real Lyzr agent. This is a real <code>POST /v3/agents/</code> — it returns a real <b>agent_id</b> and Forge Score.",
    steps: [
      { label: "Review the payload", sub: "the literal request sent to Lyzr" },
      { label: "Deploy the real agent", sub: "returns a real agent_id" },
    ],
    optional: false,
  },
  upload: {
    key: "upload",
    icon: "📤",
    title: "Upload Your Knowledge",
    reward: 30,
    railTag: "ingest documents",
    sitrepHtml:
      "Now that a real <b>agent_id</b> exists, its Qdrant collection (<code>agent_&lt;id&gt;</code>) can be created — upload documents and they're chunked, embedded, and searched on the very next chat.",
    steps: [
      { label: "Add your documents", sub: "file or pasted text" },
      { label: "Confirm ingestion", sub: "chunks upserted into the vector store" },
    ],
    optional: true,
  },
};

const LEVELS: FreeformLevel[] = [
  {
    id: "root",
    title: "Root Agent",
    description:
      "The core of every agent — who it is, how it behaves, and the model it runs on. These three missions produce the exact payload sent to Lyzr.",
    optional: false,
    missionKeys: ["identity", "instructions", "model"],
  },
  {
    id: "memory",
    title: "Memory",
    description:
      "Give the agent its own knowledge, retrieved per query at chat time — not stuffed into the prompt once.",
    optional: true,
    missionKeys: ["retrieval"],
  },
  {
    id: "tools",
    title: "Tools",
    description:
      "Let the agent call real external systems mid-conversation through the TOOL_CALL contract.",
    optional: true,
    missionKeys: ["toolDefine", "toolWire"],
  },
  {
    id: "deploy",
    title: "Deploy",
    description:
      "Create the real Lyzr agent, then — if you added knowledge — upload your documents into its vector store.",
    optional: false,
    missionKeys: ["ship", "upload"],
  },
];

export function getMission(key: MissionKey): FreeformMission {
  return MISSIONS[key];
}

/** A level's fixed position in the canonical §3b table (Root Agent=1,
 * Memory=2, Tools=3, Deploy=4) — independent of which optional levels are
 * active for this build. Used for the Build Map's persistent section
 * headers (e.g. "LEVEL 4 — DEPLOY" even when Deploy is only the 2nd level
 * actually present), so the number always matches the spec's identity for
 * that level rather than shifting with what's opted into. */
export function canonicalLevelNumber(id: LevelId): number {
  return LEVELS.findIndex((l) => l.id === id) + 1;
}

export function levelForMission(key: MissionKey): FreeformLevel {
  const lvl = LEVELS.find((l) => l.missionKeys.includes(key));
  if (!lvl) throw new Error(`no level for mission ${key}`);
  return lvl;
}

export interface BuildOpts {
  wantsKnowledge: boolean;
  wantsTools: boolean;
}

/** Which mission keys are active for this build, in Level order. Ship is
 * always present; the Deploy level's Upload mission only exists when
 * Knowledge was opted in (and is separately gated on a real agent_id at
 * navigation time). */
function activeKeys(opts: BuildOpts): MissionKey[] {
  return [
    "identity",
    "instructions",
    "model",
    ...(opts.wantsKnowledge ? (["retrieval"] as MissionKey[]) : []),
    ...(opts.wantsTools ? (["toolDefine", "toolWire"] as MissionKey[]) : []),
    "ship",
    ...(opts.wantsKnowledge ? (["upload"] as MissionKey[]) : []),
  ];
}

export function activeMissions(opts: BuildOpts): FreeformMission[] {
  return activeKeys(opts).map(getMission);
}

/** The active levels with their active missions, in the order above.
 * Optional levels (Memory/Tools) drop out entirely when not opted in;
 * Deploy always stays but its mission set flexes (Upload only with
 * Knowledge). */
export function activeLevels(opts: BuildOpts): { level: FreeformLevel; missions: FreeformMission[] }[] {
  const activeSet = new Set(activeKeys(opts));
  return LEVELS.map((level) => ({
    level,
    missions: level.missionKeys.filter((k) => activeSet.has(k)).map(getMission),
  })).filter((g) => g.missions.length > 0);
}

/** All mission validation flows through freeformLint (`lintMission`) — the
 * same rules that drive the editor console and the Ship gate. The
 * form/action missions (tools, ship, upload) have no code slots, so they
 * report informational (never-blocking) lines. */
export function missionValidate(mission: FreeformMission, ctx: LintCtx): ValidationLine[] {
  if (mission.key === "toolDefine" || mission.key === "toolWire") {
    const n = ctx.draft.tools?.length ?? 0;
    // At least one real committed tool already exists — Continue shouldn't
    // stay blocked forever just because the NEXT (uncommitted) tool draft
    // is sitting blank. Zero tools committed means the in-progress draft's
    // real per-field lint below is what actually gates progress, same as
    // every other field-bearing mission.
    if (n > 0) {
      return [
        {
          field: "collection",
          ok: true,
          warn: false,
          blocking: false,
          icon: "✓",
          msg: `${n} tool${n === 1 ? "" : "s"} attached`,
        },
      ];
    }
    return lintMission(mission.key, ctx);
  }
  if (mission.key === "ship" || mission.key === "upload") return [];
  return lintMission(mission.key, ctx);
}

export function missionBlockingCount(mission: FreeformMission, ctx: LintCtx): number {
  return missionValidate(mission, ctx).filter((l) => l.blocking && !l.ok).length;
}

/** Ship is allowed only when every field-bearing active mission passes the
 * same lint (ship/upload/tools contribute zero blocking). */
export function shipBlockingCount(missions: FreeformMission[], ctx: LintCtx): number {
  return missions.reduce((sum, m) => sum + missionBlockingCount(m, ctx), 0);
}

/** Static, general (not agent-specific) copy for the right-column
 * Trade-offs / Pitfalls / Docs tabs — same content regardless of what's
 * being built, per §3b. */
export const ASSISTANT_TABS: [string, string, string] = [
  // Trade-offs
  `<b>flash vs. pro.</b> <code>gemini-2.5-flash</code> is fast and cheap — the right default for most support and retrieval agents. <code>gemini-2.5-pro</code> reasons deeper on multi-step or ambiguous tasks but costs more and answers slower. Match the model to the hardest question the agent will actually face, not the average one.`,
  // Pitfalls
  `<b>Common mistakes:</b> a thin instruction (\"be helpful\") leaves every edge case to chance. High temperature on a factual agent invites confident wrong answers. Forgetting to state what the agent should <em>refuse</em> is the failure that shows up in red-team runs.`,
  // Docs
  `<b>What each field maps to:</b> name/role/goal → the Lyzr <code>agent_*</code> fields. instructions → <code>agent_instructions</code>. model/temperature → the create payload. Knowledge is retrieved per query (see <code>chat_handler.py</code>); tools run through the <code>TOOL_CALL</code> loop (<code>tool_handler.py</code>).`,
];
