import { FREEFORM_MODELS, type AgentDraft } from "./types";

/** Port of lib/lint.ts (the agent-forge reference's lint()), generalized
 * to the freeform AgentDraft's REAL constraints. This is the single
 * source of validation — the inline code editor's console, the
 * blocking/passed badges, the mission Continue gate, and the final Ship
 * gate all read from `lintField`; there is no second copy of these rules.
 *
 * `blocking: true` + `ok: false` genuinely blocks progress. `warn` marks a
 * real tradeoff that shouldn't hard-block (e.g. thin instructions raise
 * hallucination risk, but a short instruction is still shippable). */
export type FieldKey =
  | "name"
  | "role"
  | "goal"
  | "instructions"
  | "model"
  | "temperature"
  | "topK"
  | "collection";

export interface ValidationLine {
  field: FieldKey;
  ok: boolean;
  warn: boolean;
  blocking: boolean;
  icon: string;
  /** May contain a small amount of inline HTML (e.g. <b>…</b>). */
  msg: string;
}

/** Numeric slots (temperature, top_k) are typed as free text in the code
 * editor, so their in-progress raw strings live alongside the draft and
 * are validated directly — that's how "temperature must be 0.0–1.0" can
 * actually reject `5` or `abc` the user typed, not just clamp it away. */
export interface LintCtx {
  draft: AgentDraft;
  rawTemp: string;
  rawTopK: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ok = (field: FieldKey, msg: string): ValidationLine => ({
  field,
  ok: true,
  warn: false,
  blocking: false,
  icon: "✓",
  msg,
});
const warn = (field: FieldKey, msg: string, blocking: boolean): ValidationLine => ({
  field,
  ok: !blocking, // a warn that doesn't block still counts as "passed"
  warn: true,
  blocking,
  icon: "⚠",
  msg,
});

/** Minimum instruction length below which hallucination risk climbs — a
 * real tradeoff (thin prompts leave edge cases to chance), so it warns
 * rather than blocks. Empty instructions DO block: Lyzr create rejects a
 * missing agent_instructions. */
const INSTR_MIN = 40;
/** top_k ceiling — pulling more than this floods the turn's prompt with
 * low-relevance chunks (see §11's per-query retrieval), hurting answers. */
const TOPK_CEILING = 8;

export function lintField(field: FieldKey, ctx: LintCtx): ValidationLine {
  const { draft, rawTemp, rawTopK } = ctx;
  switch (field) {
    case "name": {
      const v = draft.name.trim();
      if (v.length < 2)
        return warn("name", "name is empty — it's what ships to Lyzr and shows everywhere the agent talks", true);
      return ok("name", `name set &rarr; <b>${esc(v)}</b>`);
    }
    case "role": {
      const v = draft.role.trim();
      if (v.length < 2) return warn("role", "role is empty — sent to Lyzr as agent_role", true);
      return ok("role", `role &rarr; <b>${esc(v)}</b>`);
    }
    case "goal": {
      const v = draft.goal.trim();
      if (v.length < 2) return warn("goal", "goal is empty — sent to Lyzr as agent_goal", true);
      return ok("goal", `goal set &rarr; <b>${esc(v)}</b>`);
    }
    case "instructions": {
      const len = draft.instructions.trim().length;
      if (len === 0)
        return warn("instructions", "instructions required — Lyzr create rejects an empty agent_instructions", true);
      if (len < INSTR_MIN)
        return warn(
          "instructions",
          `only ${len} chars — thin instructions raise hallucination risk; add boundaries and refusal rules`,
          false
        );
      return ok("instructions", `instruction accepted &rarr; <b>${len} chars</b>, well-grounded`);
    }
    case "model": {
      if (draft.model.trim() === "")
        return warn("model", "no model selected — pick one from the list", true);
      const m = FREEFORM_MODELS.find((x) => x.value === draft.model);
      if (!m)
        return warn("model", `"${esc(draft.model)}" is not a supported Lyzr model — pick one from the list`, true);
      return ok("model", `model resolved &rarr; <b>${esc(m.value)}</b>`);
    }
    case "temperature": {
      const n = parseFloat(rawTemp);
      if (rawTemp.trim() === "" || Number.isNaN(n))
        return warn("temperature", "temperature must be a number between 0.0 and 1.0", true);
      if (n < 0 || n > 1)
        return warn("temperature", `temperature ${esc(rawTemp)} is out of Lyzr's 0.0–1.0 range`, true);
      const band = n <= 0.3 ? "deterministic" : n <= 0.7 ? "balanced" : "creative";
      return ok("temperature", `temperature ${n} &rarr; <b>${band}</b> outputs`);
    }
    case "topK": {
      const k = Number(rawTopK);
      if (rawTopK.trim() === "" || !Number.isInteger(k) || k < 1)
        return warn("topK", "top_k must be a positive integer", true);
      if (k > TOPK_CEILING)
        return warn(
          "topK",
          `top_k ${k} is high — pulling that many chunks floods the prompt with noise; 3–5 is safer`,
          false
        );
      return ok("topK", `retrieval set &rarr; <b>${k} chunks</b> per query`);
    }
    case "collection": {
      // The collection is never user-named — qdrant.ts derives it as
      // `agent_<lyzr agent_id>`, created on ship. Confirm that binding
      // rather than inviting a fictional name (the §5b lesson).
      return ok("collection", "collection binds to <b>agent_&lt;id&gt;</b>, created for this agent on ship");
    }
  }
}

/** The fields each mission gates on — used to aggregate lint lines for the
 * console badge + Continue gate. */
export const MISSION_FIELDS: Record<string, FieldKey[]> = {
  identity: ["name", "role", "goal"],
  instructions: ["instructions"],
  model: ["model", "temperature"],
  retrieval: ["topK", "collection"],
};

export function lintMission(missionKey: string, ctx: LintCtx): ValidationLine[] {
  return (MISSION_FIELDS[missionKey] ?? []).map((f) => lintField(f, ctx));
}

/** Reverse lookup of MISSION_FIELDS — which mission a code-editor field
 * belongs to. Single source for progressive disclosure (locking fields
 * that belong to a not-yet-reached mission): no second field→mission
 * mapping is maintained anywhere else. */
export function fieldOwnerMission(field: FieldKey): string | undefined {
  for (const [missionKey, fields] of Object.entries(MISSION_FIELDS)) {
    if (fields.includes(field)) return missionKey;
  }
  return undefined;
}

export function blockingCount(lines: ValidationLine[]): number {
  return lines.filter((l) => l.blocking && !l.ok).length;
}
export function passedCount(lines: ValidationLine[]): number {
  return lines.filter((l) => l.ok).length;
}
