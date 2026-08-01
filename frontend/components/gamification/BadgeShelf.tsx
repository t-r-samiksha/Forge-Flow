"use client";

import { useGameStore } from "@/lib/store";
import { ACHIEVEMENT_DEFS } from "@/lib/achievements";

export default function BadgeShelf() {
  const achievements = useGameStore((s) => s.achievements);

  if (achievements.length === 0) return null;

  return (
    <div className="mb-8 flex flex-wrap items-center gap-2.5 rounded-lg border border-line bg-panel/60 px-3.5 py-3">
      <span className="font-mono text-[10.5px] uppercase tracking-[.14em] text-mute">
        Badges
      </span>
      {achievements.map((key) => {
        const def = ACHIEVEMENT_DEFS[key];
        if (!def) return null;
        return (
          <span
            key={key}
            title={def.description}
            className="flex items-center gap-1.5 rounded-full border border-[rgba(var(--color-violet-rgb)/.3)] bg-violet-dim px-3 py-1.5 font-mono text-[11px] text-violet-hi"
          >
            <span aria-hidden="true">{def.icon}</span>
            {def.label}
          </span>
        );
      })}
    </div>
  );
}
