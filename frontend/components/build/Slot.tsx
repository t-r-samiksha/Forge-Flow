"use client";

import { useEffect, useRef, useState } from "react";
import type { SlotDef } from "@/lib/campaigns";

interface SlotProps {
  def: SlotDef;
  value: string;
  filled: boolean;
  warn: boolean;
  onChange: (value: string) => void;
}

export default function Slot({ def, value, filled, warn, onChange }: SlotProps) {
  const [rippling, setRippling] = useState(false);
  const wasFilled = useRef(false);

  useEffect(() => {
    if (filled && !wasFilled.current) {
      wasFilled.current = true;
      setRippling(true);
      const t = setTimeout(() => setRippling(false), 700);
      return () => clearTimeout(t);
    }
    if (!filled) wasFilled.current = false;
  }, [filled]);

  const state = filled
    ? "border-solid border-[rgba(var(--color-spring-rgb)/.5)] bg-spring-dim text-spring"
    : warn
      ? "border-solid border-[rgba(var(--color-amber-rgb)/.5)] bg-[rgba(var(--color-amber-rgb)/.12)] text-amber"
      : "border-dashed border-[rgba(var(--color-violet-rgb)/.55)] bg-violet-dim text-violet-hi";

  return (
    <span
      className={`slot relative mx-0.5 inline-flex items-center rounded-[7px] border px-1 transition-all ${state}`}
      style={filled ? { animation: "pop .45s cubic-bezier(.34,1.56,.64,1)" } : undefined}
    >
      {!filled && (
        <span className="pointer-events-none absolute -top-4 left-0 font-mono text-[8px] uppercase tracking-[.1em] text-violet-hi opacity-65">
          ← fill
        </span>
      )}
      {def.kind === "select" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cursor-pointer appearance-none bg-transparent px-1 py-0.5 font-mono text-[13px] outline-none"
        >
          {def.options?.map((o) => (
            <option key={o.value} value={o.value} className="bg-panel text-text">
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          placeholder={def.placeholder}
          size={def.size ?? 12}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent px-1 py-0.5 font-mono text-[13px] outline-none placeholder:text-[rgba(var(--color-violet-hi-rgb)/.5)]"
        />
      )}
      {rippling && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[7px]"
          style={{ animation: "ripple .7s cubic-bezier(.4,0,.2,1)" }}
        />
      )}
    </span>
  );
}
