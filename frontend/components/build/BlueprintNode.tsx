"use client";

import type { CSSProperties, ReactNode } from "react";
import type { BlueprintNodeData } from "@/lib/campaigns";

function nodeClass(lit: boolean, kind: "io" | "hub" | "default") {
  const base =
    "absolute -translate-x-1/2 -translate-y-1/2 rounded-[10px] border-[1.5px] bg-panel-2 text-center transition-all duration-500";
  const size = kind === "hub" ? "min-w-[100px] rounded-xl p-3" : "min-w-16 px-2.5 py-2";
  if (!lit) return `${base} ${size} border-line`;
  if (kind === "hub")
    return `${base} ${size} border-plasma shadow-[0_0_32px_-2px_rgba(var(--color-plasma-rgb)/.6)]`;
  if (kind === "io")
    return `${base} ${size} border-spring shadow-[0_0_22px_-4px_rgba(var(--color-spring-rgb)/.6)]`;
  return `${base} ${size} border-violet shadow-[0_0_24px_-4px_rgba(var(--color-violet-rgb)/.65)]`;
}

function labelClass(lit: boolean, kind: "io" | "hub" | "default") {
  if (!lit) return "text-mute";
  if (kind === "hub") return "text-plasma";
  if (kind === "io") return "text-spring";
  return "text-violet-hi";
}

export interface BlueprintNodeProps {
  data: BlueprintNodeData;
  lit: boolean;
  value?: string;
  flashStyle?: CSSProperties;
  decoration?: ReactNode;
}

export default function BlueprintNode({ data, lit, value, flashStyle, decoration }: BlueprintNodeProps) {
  return (
    <div
      className={nodeClass(lit, data.kind)}
      style={{ left: data.x, top: data.y, ...flashStyle }}
    >
      <div className={`font-mono text-[8.5px] uppercase tracking-[.06em] ${labelClass(lit, data.kind)}`}>
        {data.label}
      </div>
      <div className={`mt-0.5 font-display text-[11px] font-semibold ${lit ? "text-text" : "text-dim"}`}>
        {value ?? data.staticValue ?? "—"}
      </div>
      {decoration}
    </div>
  );
}
