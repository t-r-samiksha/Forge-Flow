"use client";

import { usePathname } from "next/navigation";
import { Flame } from "lucide-react";
import { useGameStore, RANK_THRESHOLDS, type Rank } from "@/lib/store";
import AccountControl from "./AccountControl";
import ThemeToggle from "./ThemeToggle";

const RANK_ORDER: Rank[] = ["Recruit", "Engineer", "Architect", "Forgemaster"];

function nextThreshold(rank: Rank): number {
  const idx = RANK_ORDER.indexOf(rank);
  const next = RANK_ORDER[idx + 1];
  return next ? RANK_THRESHOLDS[next] : RANK_THRESHOLDS[rank] + 1;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function TopBar() {
  const pathname = usePathname();
  const xp = useGameStore((s) => s.xp);
  const rank = useGameStore((s) => s.rank);
  const timerSeconds = useGameStore((s) => s.timerSeconds);
  const streak = useGameStore((s) => s.streak);

  const floor = RANK_THRESHOLDS[rank];
  const ceiling = nextThreshold(rank);
  const progressToNextRank = (xp - floor) / (ceiling - floor);
  // A rank-up lands exactly on the new floor, which is mathematically 0%
  // progress toward the *next* rank — technically correct, but a bar that
  // goes fully empty the instant you level up reads as "lost your
  // progress" rather than "leveled up." Floor it at a visible sliver
  // whenever there's any XP at all, so the bar always shows the win.
  const progress = xp > 0 ? Math.min(1, Math.max(0.04, progressToNextRank)) : 0;

  if (pathname?.startsWith("/share")) return null;

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
      <div className="flex items-center gap-[11px]">
        <div
          className="relative h-9 w-9 overflow-hidden rounded-[10px]"
          style={{
            background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
            boxShadow: "0 4px 20px rgba(var(--color-violet-rgb)/.5)",
          }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(120deg, transparent 30%, rgba(var(--color-sheen-rgb)/.4) 50%, transparent 70%)",
              animation: "sheen 4.5s ease-in-out infinite",
              transform: "translateX(-120%)",
            }}
          />
          <span className="relative flex h-full w-full items-center justify-center font-display text-[17px] font-bold text-on-accent">
            ⬡
          </span>
        </div>
        <div>
          <div className="font-display text-base font-semibold tracking-tight text-text">
            ForgeFlow
          </div>
          <div className="font-mono text-[10.5px] text-mute">
            by HiDevs · season 1
          </div>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-5 rounded-lg border border-line bg-panel/60 px-4 py-2">
          <div className="flex flex-col items-end gap-[3px]">
            <span className="font-mono text-[9px] uppercase tracking-[.12em] text-mute">
              Elapsed
            </span>
            <span className="font-mono text-[15px] font-semibold leading-none text-plasma">
              {formatTime(timerSeconds)}
            </span>
          </div>

          <div className="h-7 w-px bg-line" aria-hidden="true" />

          <div className="flex min-w-[150px] flex-col gap-[5px]">
            <div className="flex items-baseline justify-between">
              <span className="flex items-center gap-[5px] font-mono text-[11px] font-semibold text-violet-hi">
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full bg-violet-hi"
                  style={{ boxShadow: "0 0 8px var(--color-violet-hi)" }}
                />
                {rank}
              </span>
              <span className="font-mono text-[11px] text-dim">
                {xp} / {ceiling} XP
              </span>
            </div>
            <div
              id="xp-fill-target"
              className="h-[7px] overflow-hidden rounded-md border border-line bg-panel-2"
            >
              <div
                className="relative h-full overflow-hidden rounded-md"
                style={{
                  width: `${progress * 100}%`,
                  background:
                    "linear-gradient(90deg, var(--color-violet), var(--color-violet-hi), var(--color-plasma))",
                  boxShadow: "0 0 12px rgba(var(--color-violet-rgb)/.7)",
                  transition: "width .9s cubic-bezier(.34,1.56,.64,1)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(var(--color-sheen-rgb)/.5), transparent)",
                    animation: "xpsheen 2.2s linear infinite",
                    transform: "translateX(-100%)",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="h-7 w-px bg-line" aria-hidden="true" />

          <span className="flex items-center gap-1.5 font-mono text-sm text-amber">
            <Flame size={16} />
            {streak}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <AccountControl />
        </div>
      </div>
    </header>
  );
}
