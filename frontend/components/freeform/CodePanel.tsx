"use client";

import { useEffect, useState, type ReactNode } from "react";
import { highlightPython } from "@/lib/highlightPython";
import { generateChatHandlerPy } from "@/lib/codegen";
import {
  agentPySegments,
  qdrantSetupSegments,
  toolHandlerSegments,
  type CodeSlot,
  type CodeAction,
  type CodeSegment,
} from "@/lib/freeformCode";
import { providerForModel, type AgentDraft } from "@/lib/types";
import type { FieldKey, SlotState } from "@/lib/freeformLint";

export type { SlotState };

const FILES = ["agent.py", "qdrant_setup.py", "chat_handler.py", "tool_handler.py"] as const;
export type FileName = (typeof FILES)[number];

const FILE_NOTES: Record<FileName, string> = {
  "agent.py": "watching agent.py — fill the highlighted slots to see live checks",
  "qdrant_setup.py": "how uploaded docs get chunked, embedded, and searched — top_k is yours to set",
  "chat_handler.py": "runs on every message — retrieval, then the real chat call (read-only)",
  "tool_handler.py": "watching tool_handler.py — fill the highlighted slots to attach a tool",
};

export interface CodeExtraFile {
  name: string;
  content: string;
  /** Shown in the file-note bar under the tab strip, same spot
   * FILE_NOTES uses. Defaults to a generic "generated file" note. */
  note?: string;
}

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
  /** Additional real, read-only generated files shown as extra tabs
   * alongside the standard 4 — used by the Crew orchestrator mission
   * (Phase 5) for crew_config.py/orchestrator.py. Empty/absent for every
   * other caller, which sees the same 4 tabs as always. */
  extraFiles?: CodeExtraFile[];
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
 * the raw-string round-trip). No separate form state.
 *
 * draft/update/rawTemp/rawTopK/onNumericChange are only consulted as the
 * default value/onChange source when the slot itself doesn't override
 * them — a caller with no AgentDraft at all (e.g. Crew's role-label list,
 * FIX 3) can omit them entirely as long as every slot it renders supplies
 * its own value/onChange, and reuse this exact same component. */
export function InlineSlot({
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
  draft?: AgentDraft;
  update?: (patch: Partial<AgentDraft>) => void;
  rawTemp?: string;
  rawTopK?: string;
  onNumericChange?: (field: "temperature" | "topK", raw: string) => void;
  onFieldEdit?: (field: FieldKey) => void;
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

  // slot.value/onChange override the default draft[field] binding — used
  // for a repeating row (an already-attached tool, or the "kind"/"params"
  // sub-fields that share a field's lock state but not its storage) rather
  // than a plain top-level AgentDraft key.
  if (slot.kind === "select") {
    const selectValue = slot.value ?? draft?.model ?? "";
    const handleChange =
      slot.onChange ?? ((v: string) => update?.({ model: v, provider: providerForModel(v) }));
    return wrap(
      <select
        value={selectValue}
        disabled={locked}
        onChange={(e) => {
          handleChange(e.target.value);
          onFieldEdit?.(slot.field);
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
    slot.value !== undefined
      ? slot.value
      : slot.field === "temperature"
        ? (rawTemp ?? "")
        : slot.field === "topK"
          ? (rawTopK ?? "")
          : ((draft as unknown as Record<string, string> | undefined)?.[slot.field] ?? "");

  const handleChange =
    slot.onChange ??
    ((v: string) => {
      if (slot.field === "temperature" || slot.field === "topK") {
        onNumericChange?.(slot.field, v);
      } else {
        update?.({ [slot.field]: v } as Partial<AgentDraft>);
      }
    });

  return wrap(
    <input
      type="text"
      value={value}
      disabled={locked}
      placeholder={locked ? "🔒 locked" : (placeholderHint ?? slot.placeholder)}
      size={locked ? 10 : (slot.size ?? 12)}
      onChange={(e) => {
        handleChange(e.target.value);
        onFieldEdit?.(slot.field);
      }}
      className="bg-transparent px-1 py-0.5 font-mono text-[13px] outline-none placeholder:text-[rgba(var(--color-violet-hi-rgb)/.5)] disabled:cursor-not-allowed disabled:placeholder:text-mute"
    />
  );
}

/** One inline clickable action embedded in the code text — "+ attach
 * tool" / "× remove" (FIX 2). Same code-editor-as-only-input-surface rule
 * as InlineSlot, just a button instead of a field. */
export function InlineAction({ action }: { action: CodeAction }) {
  const attach = action.tone === "attach";
  return (
    <button
      type="button"
      disabled={action.disabled}
      onClick={action.onClick}
      className={`slot mx-0.5 inline-flex items-center rounded-[7px] border px-1.5 align-middle font-mono text-[12px] transition-all ${
        attach
          ? "border-solid border-violet bg-[rgba(var(--color-violet-rgb)/.14)] text-violet-hi hover:bg-[rgba(var(--color-violet-rgb)/.22)] disabled:cursor-not-allowed disabled:opacity-40"
          : "border-solid border-[rgba(var(--color-rose-rgb)/.4)] bg-[rgba(var(--color-rose-rgb)/.1)] text-rose hover:bg-[rgba(var(--color-rose-rgb)/.18)]"
      }`}
    >
      {action.label}
    </button>
  );
}

/** Renders a list of CodeSegments (static highlighted HTML + real inline
 * slots + real inline actions) — the interactive-file body CodePanel uses,
 * pulled out so a screen with no AgentDraft at all (Crew's role-label
 * list, FIX 3) can render the exact same real slot/action mechanism
 * without needing to fabricate one. */
export function SegmentsView({
  segments,
  draft,
  update,
  rawTemp,
  rawTopK,
  onNumericChange,
  onFieldEdit,
  slotState,
  hints,
  isFieldUnlocked,
}: {
  segments: CodeSegment[];
  draft?: AgentDraft;
  update?: (patch: Partial<AgentDraft>) => void;
  rawTemp?: string;
  rawTopK?: string;
  onNumericChange?: (field: "temperature" | "topK", raw: string) => void;
  onFieldEdit?: (field: FieldKey) => void;
  slotState?: (field: FieldKey) => SlotState;
  hints?: Partial<Record<FieldKey, string>> | null;
  isFieldUnlocked?: (field: FieldKey) => boolean;
}) {
  return (
    <div
      className="overflow-auto px-4 py-4 font-mono text-[13px] leading-[2.02] text-[var(--color-code-text)]"
      style={{ maxHeight: 460, whiteSpace: "pre-wrap" }}
    >
      {segments.map((seg, i) =>
        "slot" in seg ? (
          <InlineSlot
            key={seg.slot.rowKey ?? i}
            slot={seg.slot}
            draft={draft}
            update={update}
            rawTemp={rawTemp}
            rawTopK={rawTopK}
            onNumericChange={onNumericChange}
            onFieldEdit={onFieldEdit}
            state={seg.slot.state ?? slotState?.(seg.slot.field) ?? "ok"}
            placeholderHint={hints?.[seg.slot.field] ?? undefined}
            locked={seg.slot.locked ?? !(isFieldUnlocked?.(seg.slot.field) ?? true)}
          />
        ) : "action" in seg ? (
          <InlineAction key={seg.action.key ?? i} action={seg.action} />
        ) : (
          // eslint-disable-next-line react/no-danger
          <span key={i} dangerouslySetInnerHTML={{ __html: seg.html }} />
        )
      )}
    </div>
  );
}

/** The traffic-light-chrome + tab-strip + file-note wrapper every code
 * panel (freeform's 4-file CodePanel below, and Crew's single-file
 * "Define the Crew" editor, FIX 3) shares — one real visual definition,
 * not a second one that could drift out of sync. */
export function CodeFrame({
  tabs,
  active,
  onSelectFile,
  fileNote,
  children,
}: {
  tabs: string[];
  active: string;
  onSelectFile: (name: string) => void;
  fileNote: string;
  children: ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-line bg-code-bg"
      style={{ boxShadow: "0 10px 40px -20px rgba(var(--color-shadow-rgb)/.8)" }}
    >
      <div className="flex items-center overflow-x-auto border-b border-line bg-panel-2 pl-3">
        <div className="flex flex-none items-center gap-[7px] pr-3">
          <span className="h-[11px] w-[11px] rounded-full" style={{ background: "var(--dot-red)" }} />
          <span className="h-[11px] w-[11px] rounded-full" style={{ background: "var(--dot-yellow)" }} />
          <span className="h-[11px] w-[11px] rounded-full" style={{ background: "var(--dot-green)" }} />
        </div>
        {tabs.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onSelectFile(f)}
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

      <p className="border-b border-line bg-panel px-4 py-2 font-mono text-[10.5px] text-mute">{fileNote}</p>

      {children}
    </div>
  );
}

export default function CodePanel(props: CodePanelProps) {
  const { draft, defaultFile, extraFiles = [] } = props;
  const [active, setActive] = useState<string>(defaultFile ?? "agent.py");

  // Follow the mission's default file when it changes (e.g. Knowledge
  // mission focuses qdrant_setup.py), without fighting manual tab clicks.
  useEffect(() => {
    if (defaultFile) setActive(defaultFile);
  }, [defaultFile]);

  const extraFile = extraFiles.find((f) => f.name === active);
  const interactive =
    !extraFile && (active === "agent.py" || active === "qdrant_setup.py" || active === "tool_handler.py");
  const segments =
    active === "agent.py"
      ? agentPySegments(draft)
      : active === "tool_handler.py"
        ? toolHandlerSegments(draft, props.update, props.onFieldEdit)
        : qdrantSetupSegments();
  const readOnly = extraFile ? extraFile.content : generateChatHandlerPy();
  const fileNote = extraFile
    ? (extraFile.note ?? `${extraFile.name} — real generated file (read-only)`)
    : FILE_NOTES[active as FileName];

  return (
    <CodeFrame
      tabs={[...FILES, ...extraFiles.map((f) => f.name)]}
      active={active}
      onSelectFile={setActive}
      fileNote={fileNote}
    >
      {/* syntax-A palette (base .kw/.str/.cmt classes, not .learn-snippet).
          Interactive files interleave real inputs via SegmentsView. */}
      {interactive ? (
        <SegmentsView
          segments={segments}
          draft={props.draft}
          update={props.update}
          rawTemp={props.rawTemp}
          rawTopK={props.rawTopK}
          onNumericChange={props.onNumericChange}
          onFieldEdit={props.onFieldEdit}
          slotState={props.slotState}
          hints={props.hints}
          isFieldUnlocked={props.isFieldUnlocked}
        />
      ) : (
        <pre
          className="overflow-auto px-4 py-4 font-mono text-[13px] leading-[2.02] text-[var(--color-code-text)]"
          style={{ maxHeight: 460, whiteSpace: "pre" }}
        >
          {/* eslint-disable-next-line react/no-danger */}
          <code dangerouslySetInnerHTML={{ __html: highlightPython(readOnly) }} />
        </pre>
      )}
    </CodeFrame>
  );
}
