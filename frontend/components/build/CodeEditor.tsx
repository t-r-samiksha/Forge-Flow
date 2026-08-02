"use client";

import { useEffect, useMemo, useState } from "react";
import type { Mission, SlotDef } from "@/lib/campaigns";
import { reducedMotion } from "@/lib/effects";
import Slot from "./Slot";

interface CodeEditorProps {
  mission: Mission;
  slotValues: Record<number, string>;
  checked: boolean[];
  onSlotChange: (slot: SlotDef, value: string) => void;
}

export default function CodeEditor({
  mission,
  slotValues,
  checked,
  onSlotChange,
}: CodeEditorProps) {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (reducedMotion()) {
      setRevealed(mission.code.length);
      return;
    }
    setRevealed(0);
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      i++;
      setRevealed(i);
      if (i < mission.code.length) timer = setTimeout(step, 85);
    };
    timer = setTimeout(step, 85);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.key]);

  const numbered = useMemo(() => {
    let n = 1;
    return mission.code.map((line) => (line.kind === "blank" ? null : n++));
  }, [mission.code]);

  const firstUnfilledIndex = checked.findIndex((c) => !c);
  const activeLineIdx = useMemo(() => {
    if (firstUnfilledIndex < 0) return -1;
    return mission.code.findIndex((line) =>
      line.parts.some((p) => p.slot?.index === firstUnfilledIndex)
    );
  }, [mission.code, firstUnfilledIndex]);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-line bg-code-bg shadow-[0_10px_40px_-20px_rgba(var(--color-shadow-rgb)/.8)]">
      <div className="flex items-center overflow-x-auto border-b border-line bg-panel-2 pl-1.5">
        <div className="flex items-center gap-[7px] border-b-2 border-violet bg-code-bg px-[15px] py-[11px] font-mono text-[11.5px] text-text">
          <span className="h-[7px] w-[7px] rounded-sm bg-plasma" />
          {mission.file}
        </div>
        <div className="flex items-center gap-[7px] px-[15px] py-[11px] font-mono text-[11.5px] text-mute">
          <span className="h-[7px] w-[7px] rounded-sm bg-plasma" />
          qdrant_setup.py <span className="text-[9px]">🔒</span>
        </div>
        <div className="flex items-center gap-[7px] px-[15px] py-[11px] font-mono text-[11.5px] text-mute">
          <span className="h-[7px] w-[7px] rounded-sm bg-mute" />
          requirements.txt
        </div>
        <div className="ml-auto flex items-center px-[15px] py-[11px] font-mono text-[10px] tracking-[.05em] text-mute">
          <span
            className="mr-1.5 h-1.5 w-1.5 rounded-full bg-spring"
            style={{ boxShadow: "0 0 8px var(--color-spring)", animation: "pulse 1.6s infinite" }}
          />
          autosaved
        </div>
      </div>
      <div className="relative overflow-x-auto px-1.5 py-4 font-mono text-[13px] leading-[2.02]">
        {mission.code.slice(0, revealed).map((line, i) => (
          <div
            key={i}
            className={`relative flex ${
              line.kind === "newline" ? "bg-[rgba(var(--color-spring-rgb)/.055)]" : ""
            } ${i === activeLineIdx ? "bg-[rgba(var(--color-violet-rgb)/.07)]" : ""}`}
          >
            {i === activeLineIdx && (
              <span className="absolute inset-y-0 left-0 w-[2px] bg-violet shadow-[0_0_10px_var(--color-violet)]" />
            )}
            <span
              className={`w-10 flex-shrink-0 select-none pr-4 text-right tabular-nums ${
                i === activeLineIdx
                  ? "text-violet-hi"
                  : line.kind === "newline"
                    ? "text-spring"
                    : "text-mute"
              }`}
            >
              {numbered[i] ?? ""}
            </span>
            <span
              className="whitespace-pre text-[var(--color-code-text)]"
              style={
                line.kind === "indent" || line.kind === "newline"
                  ? { paddingLeft: 22 }
                  : undefined
              }
            >
              {line.parts.map((part, pi) =>
                part.slot ? (
                  <Slot
                    key={pi}
                    def={part.slot}
                    value={slotValues[part.slot.index] ?? ""}
                    filled={checked[part.slot.index] ?? false}
                    warn={
                      (slotValues[part.slot.index]?.length ?? 0) > 0 &&
                      !(checked[part.slot.index] ?? false)
                    }
                    onChange={(v) => onSlotChange(part.slot!, v)}
                  />
                ) : (
                  // eslint-disable-next-line react/no-danger
                  <span key={pi} dangerouslySetInnerHTML={{ __html: part.html ?? "" }} />
                )
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
