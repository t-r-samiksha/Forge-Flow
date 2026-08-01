"use client";

import { useEffect, useState, type ReactNode } from "react";
import { highlightPython } from "@/lib/highlightPython";
import { generateChatHandlerPy, generateToolHandlerPy } from "@/lib/codegen";
import { agentPySegments, qdrantSetupSegments, type CodeSlot } from "@/lib/freeformCode";
import { providerForModel, type AgentDraft } from "@/lib/types";
import type { FieldKey } from "@/lib/freeformLint";

const FILES = ["agent.py", "qdrant_setup.py", "chat_handler.py", "tool_handler.py"] as const;
export type FileName = (typeof FILES)[number];

const FILE_NOTES: Record<FileName, string> = {
  "agent.py": "watching agent.py — fill the highlighted slots to see live checks",
  "qdrant_setup.py": "how uploaded docs get chunked, embedded, and searched — top_k is yours to set",
  "chat_handler.py": "runs on every message — retrieval, then the real chat call (read-only)",
  "tool_handler.py": "the real TOOL_CALL loop — parse marker, run tool, feed result back (read-only)",
};

export type SlotState = "ok" | "warn" | "empty";

export interface CodePanelProps {
  draft: AgentDraft;
  update: (patch: Partial<AgentDraft>) => void;
  rawTemp: string;
  rawTopK: string;
  onNumericChange: (field: "temperature" | "topK", raw: string) => void;
  onFieldEdit: (field: FieldKey) => void;
  slotState: (field: FieldKey) => SlotState;
  defaultFile?: FileName;
  /** When cloning a template, the template's values ride in as per-field
   * placeholder hints (greyed, not filled) rather than active defaults. */
  hints?: Partial<Record<FieldKey, string>> | null;
  /** Progressive disclosure: whether this field's owning mission has been
   * reached yet. Fields belonging to a not-yet-reached mission render
   * inert — no FILL highlight, no pointer events, no focus. Defaults to
   * always-unlocked so any other caller (none currently) doesn't need to
   * opt in. */
  isFieldUnlocked?: (field: FieldKey) => boolean;
}

function slotClasses(state: SlotState, locked: boolean): string {
  const base =
    "slot relative mx-0.5 inline-flex items-center rounded-[7px] border px-1 align-middle transition-all";
  if (locked) return `${base} border-dashed border-line bg-panel-3 text-mute opacity-60 pointer-events-none`;
  if (state === "ok")
    return `${base} border-solid border-[rgba(var(--color-spring-rgb)/.5)] bg-spring-dim text-spring`;
  if (state === "warn")
    return `${base} border-solid border-[rgba(var(--color-amber-rgb)/.5)] bg-[rgba(var(--color-amber-rgb)/.12)] text-amber`;
  return `${base} border-dashed border-[rgba(var(--color-violet-rgb)/.55)] bg-violet-dim text-violet-hi`;
}

/** One inline editable slot — a real <input>/<select> living inside the
 * code text, two-way bound straight to the AgentDraft (numeric fields via
 * the raw-string round-trip). No separate form state. */
function InlineSlot({
  slot,
  draft,
  update,
  rawTemp,
  rawTopK,
  onNumericChange,
  onFieldEdit,
  state,
  placeholderHint,
  locked,
}: {
  slot: CodeSlot;
  draft: AgentDraft;
  update: (patch: Partial<AgentDraft>) => void;
  rawTemp: string;
  rawTopK: string;
  onNumericChange: (field: "temperature" | "topK", raw: string) => void;
  onFieldEdit: (field: FieldKey) => void;
  state: SlotState;
  placeholderHint?: string;
  locked: boolean;
}) {
  // A locked slot never shows the "come fill me" FILL badge — that
  // highlight is specifically for fields the developer can act on right
  // now (progressive disclosure: future-mission fields read as inert).
  const showFill = state === "empty" && !locked;
  const wrap = (inner: ReactNode) => (
    <span className={slotClasses(state, locked)}>
      {showFill && (
        <span className="pointer-events-none absolute -top-4 left-0 font-mono text-[8px] uppercase tracking-[.1em] text-violet-hi opacity-65">
          ← fill
        </span>
      )}
      {inner}
    </span>
  );

  if (slot.kind === "select") {
    return wrap(
      <select
        value={draft.model}
        disabled={locked}
        onChange={(e) => {
          update({ model: e.target.value, provider: providerForModel(e.target.value) });
          onFieldEdit("model");
        }}
        className="cursor-pointer appearance-none bg-transparent px-1 py-0.5 font-mono text-[13px] outline-none disabled:cursor-not-allowed"
      >
        {slot.options?.map((o) => (
          <option key={o.value} value={o.value} className="bg-panel text-text">
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  const value =
    slot.field === "temperature"
      ? rawTemp
      : slot.field === "topK"
        ? rawTopK
        : (draft[slot.field] as string);

  return wrap(
    <input
      type="text"
      value={value}
      disabled={locked}
      placeholder={locked ? "🔒 locked" : (placeholderHint ?? slot.placeholder)}
      size={locked ? 10 : (slot.size ?? 12)}
      onChange={(e) => {
        const v = e.target.value;
        if (slot.field === "temperature" || slot.field === "topK") {
          onNumericChange(slot.field, v);
        } else {
          update({ [slot.field]: v } as Partial<AgentDraft>);
        }
        onFieldEdit(slot.field);
      }}
      className="bg-transparent px-1 py-0.5 font-mono text-[13px] outline-none placeholder:text-[rgba(var(--color-violet-hi-rgb)/.5)] disabled:cursor-not-allowed disabled:placeholder:text-mute"
    />
  );
}

export default function CodePanel(props: CodePanelProps) {
  const { draft, defaultFile } = props;
  const [active, setActive] = useState<FileName>(defaultFile ?? "agent.py");

  // Follow the mission's default file when it changes (e.g. Knowledge
  // mission focuses qdrant_setup.py), without fighting manual tab clicks.
  useEffect(() => {
    if (defaultFile) setActive(defaultFile);
  }, [defaultFile]);

  const interactive = active === "agent.py" || active === "qdrant_setup.py";
  const segments = active === "agent.py" ? agentPySegments(draft) : qdrantSetupSegments();
  const readOnly = active === "chat_handler.py" ? generateChatHandlerPy() : generateToolHandlerPy(draft);

  return (
    <div
      className="overflow-hidden rounded-xl border border-line bg-code-bg"
      style={{ boxShadow: "0 10px 40px -20px rgba(var(--color-shadow-rgb)/.8)" }}
    >
      {/* editor bar — traffic-light chrome + tabs + autosaved */}
      <div className="flex items-center overflow-x-auto border-b border-line bg-panel-2 pl-3">
        <div className="flex flex-none items-center gap-[7px] pr-3">
          <span className="h-[11px] w-[11px] rounded-full" style={{ background: "var(--dot-red)" }} />
          <span className="h-[11px] w-[11px] rounded-full" style={{ background: "var(--dot-yellow)" }} />
          <span className="h-[11px] w-[11px] rounded-full" style={{ background: "var(--dot-green)" }} />
        </div>
        {FILES.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setActive(f)}
            className={`flex flex-none items-center gap-[7px] px-[15px] py-[11px] font-mono text-[11.5px] transition-colors ${
              active === f ? "border-b-2 border-violet bg-code-bg text-text" : "text-mute hover:text-text"
            }`}
          >
            <span className={`h-[7px] w-[7px] rounded-sm ${active === f ? "bg-plasma" : "bg-mute"}`} />
            {f}
          </button>
        ))}
        <div className="ml-auto flex flex-none items-center px-[15px] py-[11px] font-mono text-[10px] tracking-[.05em] text-mute">
          <span
            className="mr-1.5 h-1.5 w-1.5 rounded-full bg-spring"
            style={{ boxShadow: "0 0 8px var(--color-spring)", animation: "pulse 1.6s infinite" }}
          />
          autosaved
        </div>
      </div>

      <p className="border-b border-line bg-panel px-4 py-2 font-mono text-[10.5px] text-mute">
        {FILE_NOTES[active]}
      </p>

      {/* code area — syntax-A palette (base .kw/.str/.cmt classes, not
          .learn-snippet). Interactive files interleave real inputs. */}
      {interactive ? (
        <div
          className="overflow-auto px-4 py-4 font-mono text-[13px] leading-[2.02] text-[var(--color-code-text)]"
          style={{ maxHeight: 460, whiteSpace: "pre-wrap" }}
        >
          {segments.map((seg, i) =>
            "slot" in seg ? (
              <InlineSlot
                key={i}
                slot={seg.slot}
                draft={props.draft}
                update={props.update}
                rawTemp={props.rawTemp}
                rawTopK={props.rawTopK}
                onNumericChange={props.onNumericChange}
                onFieldEdit={props.onFieldEdit}
                state={props.slotState(seg.slot.field)}
                placeholderHint={props.hints?.[seg.slot.field] ?? undefined}
                locked={!(props.isFieldUnlocked?.(seg.slot.field) ?? true)}
              />
            ) : (
              // eslint-disable-next-line react/no-danger
              <span key={i} dangerouslySetInnerHTML={{ __html: seg.html }} />
            )
          )}
        </div>
      ) : (
        <pre
          className="overflow-auto px-4 py-4 font-mono text-[13px] leading-[2.02] text-[var(--color-code-text)]"
          style={{ maxHeight: 460, whiteSpace: "pre" }}
        >
          {/* eslint-disable-next-line react/no-danger */}
          <code dangerouslySetInnerHTML={{ __html: highlightPython(readOnly) }} />
        </pre>
      )}
    </div>
  );
}
