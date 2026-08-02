"use client";

import type { MissionStep } from "@/lib/campaigns";

interface MissionRailProps {
  steps: MissionStep[];
  checked: boolean[];
  railTag: string;
  /** Override which row is highlighted as active. Defaults to the first
   * unchecked row (legacy campaign behavior). The freeform builder passes
   * the current mission index so the highlight follows navigation, not
   * just completion order. */
  activeIndex?: number;
  /** When provided, rows become clickable (freeform Build Map jumps to a
   * mission). Legacy campaigns omit this and rows stay static. */
  onSelect?: (index: number) => void;
  /** Whether the rail pins itself on scroll. Legacy campaigns rely on this
   * (default true). The freeform Build Map sets it false and stickies the
   * whole left column instead, so the "Add optional missions" box beneath
   * the rail can't get overlapped/clipped by an individually-sticky rail. */
  sticky?: boolean;
  /** Rows that are present but not yet selectable (freeform: the Upload
   * mission before a real agent_id exists). Rendered greyed + a 🔒, and
   * `onSelect` is suppressed for them. Legacy omits this → all selectable. */
  disabledIndices?: number[];
  /** Section headers grouping rows by Level (freeform only — legacy omits
   * this and renders one flat list, unchanged). Each entry's `startIndex`
   * is the row index (into `steps`) where that section begins; sections
   * must be contiguous and pre-sorted by index. Computed by the caller
   * from the same `activeLevels()` that drives the Level-intro screens —
   * not a second source of truth for the grouping. */
  sections?: { label: string; startIndex: number }[];
}

export default function MissionRail({
  steps,
  checked,
  railTag,
  activeIndex,
  onSelect,
  sticky = true,
  disabledIndices = [],
  sections = [],
}: MissionRailProps) {
  const firstUnfilled = checked.findIndex((c) => !c);
  const activeRow = activeIndex ?? firstUnfilled;
  const isDisabled = (i: number) => disabledIndices.includes(i);
  const sectionAt = (i: number) => sections.find((s) => s.startIndex === i);
  // A level boundary breaks the connecting line between rows — each
  // level's chain stays visually contained within its own group.
  const startsNewSection = (i: number) => sections.some((s) => s.startIndex === i);

  return (
    <div
      className={`rounded-2xl border border-line p-[26px] ${sticky ? "sticky top-[22px]" : ""}`}
      style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
    >
      <div className="mb-4 font-mono text-[10.5px] font-semibold uppercase tracking-[.13em] text-mute">
        Build map
      </div>
      <div>
        {steps.map((step, i) => {
          const done = checked[i];
          const active = i === activeRow;
          const disabled = isDisabled(i);
          const section = sectionAt(i);
          const lineContinues = i !== steps.length - 1 && !startsNewSection(i + 1);
          return (
            <div key={i}>
              {section && (
                <div
                  className={`mb-2 font-mono text-[9.5px] font-bold uppercase tracking-[.1em] text-violet-hi ${
                    i > 0 ? "mt-4 border-t border-line pt-4" : ""
                  }`}
                >
                  {section.label}
                </div>
              )}
              <div
                className={`relative flex gap-3 py-1 ${
                  disabled ? "cursor-not-allowed opacity-50" : onSelect ? "cursor-pointer" : ""
                }`}
                onClick={onSelect && !disabled ? () => onSelect(i) : undefined}
              >
                {lineContinues && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-[13px] top-8 bottom-[-4px] w-0.5 transition-colors duration-500 ${
                      done ? "bg-spring" : "bg-line"
                    }`}
                  />
                )}
                <div
                  className={`z-[1] flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] font-mono text-[11px] transition-all duration-[400ms] ${
                    done
                      ? "scale-105 border-spring bg-spring text-on-spring"
                      : active
                        ? "border-violet bg-violet-dim text-violet-hi shadow-[0_0_0_4px_rgba(var(--color-violet-rgb)/.14)]"
                        : "border-line bg-panel-2 text-mute"
                  }`}
                >
                  {done ? "✓" : disabled ? "🔒" : i + 1}
                </div>
                <div className="pb-4 pt-[3px]">
                  <b
                    className={`block text-[12.5px] font-semibold transition-colors ${
                      done || active ? "text-text" : "text-dim"
                    }`}
                  >
                    {step.label}
                  </b>
                  <span className="font-mono text-[10.5px] text-mute">{step.sub}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 border-t border-line pt-3.5 font-mono text-[9px] uppercase tracking-[.1em] text-mute">
        {railTag}
      </div>
    </div>
  );
}
