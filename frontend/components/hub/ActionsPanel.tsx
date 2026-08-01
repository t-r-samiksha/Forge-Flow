"use client";

import { useEffect, useState } from "react";
import type { ForgedAgent } from "@/lib/store";

interface ActionsPanelProps {
  agent: ForgedAgent;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}

function timeAgo(iso?: string): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ActionsPanel({ agent, dirty, saving, onSave, onReset }: ActionsPanelProps) {
  const [rippling, setRippling] = useState(false);
  const [displayVersion, setDisplayVersion] = useState(agent.version);

  useEffect(() => {
    if (agent.version === displayVersion) return;
    const from = displayVersion;
    const to = agent.version;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 500);
      setDisplayVersion(Math.round(from + (to - from) * p));
      if (p < 1) requestAnimationFrame(tick);
      else setDisplayVersion(to);
    };
    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.version]);

  const handleSave = () => {
    setRippling(true);
    setTimeout(() => setRippling(false), 700);
    onSave();
  };

  return (
    <div
      className="rounded-2xl border border-line p-[26px]"
      style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
    >
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="relative overflow-hidden rounded-[10px] px-6 py-3 text-sm font-semibold text-on-accent transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
            boxShadow: dirty ? "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)" : undefined,
          }}
        >
          {saving ? "Re-forging…" : "Save & Re-forge"}
          {rippling && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[10px]"
              style={{ animation: "ripple .7s cubic-bezier(.4,0,.2,1)" }}
            />
          )}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!dirty}
          className="rounded-[10px] border border-line-2 bg-panel px-6 py-3 text-sm text-text transition-colors hover:border-violet disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset to Original
        </button>
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-8 font-mono text-xs text-mute">
        <span>
          Agent Version: <b className="text-violet-hi">v{displayVersion}</b>
        </span>
        <span>
          Forge Score: <b className="text-spring">{agent.forgeScore}/100</b>
        </span>
        <span>
          Last Edited: <b className="text-text">{timeAgo(agent.lastEditedAt)}</b>
        </span>
      </div>
    </div>
  );
}
