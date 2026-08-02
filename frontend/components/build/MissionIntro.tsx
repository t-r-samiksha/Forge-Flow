"use client";

import type { MissionStep } from "@/lib/campaigns";

interface MissionIntroProps {
  missionNumber: number;
  totalMissions: number;
  title: string;
  descHtml: string;
  steps: MissionStep[];
  reward: number;
  onBegin: () => void;
  /** Optional override for the "Mission N of M" kicker (e.g. the freeform
   * builder passes "Mission 2 of 4"). Defaults to that same phrasing. */
  kicker?: string;
  /** Optional back affordance — the freeform builder wires this to return
   * to the Build Map; legacy campaigns omit it. */
  onBack?: () => void;
  beginLabel?: string;
  /** Trailing word on the reward line: "on completion" for a mission,
   * "available" for a Level-intro (which totals its missions' XP). */
  rewardLabel?: string;
  /** Real "previous screen" navigation — the chain-symmetric counterpart to
   * onBegin, rendered beside it at the bottom. Undefined on the very first
   * screen of a build (nothing to go back to). */
  onPrev?: () => void;
  prevLabel?: string;
}

export default function MissionIntro({
  missionNumber,
  totalMissions,
  title,
  descHtml,
  steps,
  reward,
  onBegin,
  kicker,
  onBack,
  beginLabel = "Begin mission →",
  rewardLabel = "on completion",
  onPrev,
  prevLabel = "← Back",
}: MissionIntroProps) {
  return (
    <div className="mx-auto max-w-[720px] px-6 py-10">
      <div
        className="rounded-2xl border border-line p-[34px]"
        style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[.13em] text-violet-hi">
            {kicker ?? `Mission ${missionNumber} of ${totalMissions}`}
          </div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="font-mono text-[11px] text-mute transition-colors hover:text-dim"
            >
              ← Build Map
            </button>
          )}
        </div>
        <h2 className="mb-3 font-display text-[26px] font-semibold tracking-[-.01em]">{title}</h2>
        <p
          className="mb-7 text-[14px] leading-[1.65] text-dim [&_code]:rounded [&_code]:bg-panel-3 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-plasma [&_em]:not-italic [&_em]:text-violet-hi [&_b]:text-text"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: descHtml }}
        />

        <div className="mb-8">
          {steps.map((step, i) => (
            <div key={i} className="relative flex gap-3.5 py-1">
              {i !== steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-[-4px] left-[15px] top-9 w-0.5 bg-line"
                />
              )}
              <div className="z-[1] flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-line bg-panel-2 font-mono text-[12px] text-mute">
                {i + 1}
              </div>
              <div className="pb-5 pt-1">
                <b className="block text-[13.5px] font-semibold text-text">{step.label}</b>
                <span className="font-mono text-[11px] text-mute">{step.sub}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-line pt-5">
          <span className="font-mono text-xs text-mute">
            <b className="text-violet-hi">+{reward} XP</b> {rewardLabel}
          </span>
          <div className="flex items-center gap-2.5">
            {onPrev && (
              <button
                type="button"
                onClick={onPrev}
                className="rounded-[10px] border border-line px-5 py-3 text-sm font-semibold text-dim transition-all hover:-translate-y-0.5 hover:border-violet hover:text-violet-hi"
              >
                {prevLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onBegin}
              className="rounded-[10px] px-7 py-3 text-sm font-semibold text-on-accent transition-all hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
                boxShadow: "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)",
              }}
            >
              {beginLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
