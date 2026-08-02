"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { reducedMotion } from "@/lib/effects";
import type { CampaignBlueprint } from "@/lib/campaigns";
import BlueprintNode from "./BlueprintNode";
import BlueprintWire from "./BlueprintWire";
import DataPacket from "./DataPacket";

interface Packet {
  id: number;
  x: number;
  y: number;
  color: string;
}

/** Reference's flashNode(): a one-shot .6s brightness flash the instant a
 * node transitions from unlit to lit. Time-windowed (not a boolean "has
 * flashed" flag) so an unrelated re-render mid-animation can't cut it off
 * early by dropping the inline style before the 600ms is up. */
function useActivationFlash() {
  const startedAt = useRef<Record<string, number>>({});
  return function flashStyle(key: string, active: boolean): CSSProperties | undefined {
    const now = performance.now();
    const at = startedAt.current[key];
    if (!active) {
      delete startedAt.current[key];
      return undefined;
    }
    if (at === undefined) startedAt.current[key] = now;
    const elapsed = now - (startedAt.current[key] ?? now);
    if (elapsed < 600) return { animation: "nodeflash .6s ease" };
    return undefined;
  };
}

/** Reference's wire('id', true): the wire draws itself in over .7s
 * (stroke-dashoffset 400 -> 0) before settling into the continuous
 * dashflow look — same time-windowed trigger as the node flash. */
function useWireDraw() {
  const startedAt = useRef<Record<string, number>>({});
  return function drawStyle(key: string, active: boolean): CSSProperties | undefined {
    const now = performance.now();
    const at = startedAt.current[key];
    if (!active) {
      delete startedAt.current[key];
      return undefined;
    }
    if (at === undefined) startedAt.current[key] = now;
    const elapsed = now - (startedAt.current[key] ?? now);
    if (elapsed < 700) {
      return {
        strokeDasharray: 400,
        strokeDashoffset: 0,
        animation: "drawwire .7s cubic-bezier(.4,0,.2,1) forwards",
      };
    }
    return undefined;
  };
}

export interface LiveBlueprintProps {
  blueprint: CampaignBlueprint;
  litMap: Record<string, boolean>;
  valueMap: Record<string, string>;
  wireMap: Record<string, boolean>;
  tempOn: boolean;
  tempVal: string;
  bpLive: boolean;
  bpStatusText: string;
  bpCaption: string;
}

export default function LiveBlueprint({
  blueprint,
  litMap,
  valueMap,
  wireMap,
  tempOn,
  tempVal,
  bpLive,
  bpStatusText,
  bpCaption,
}: LiveBlueprintProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const wireRefs = useRef<Record<string, SVGPathElement | null>>({});
  const [packets, setPackets] = useState<Packet[]>([]);
  const flash = useActivationFlash();
  const draw = useWireDraw();

  useEffect(() => {
    if (!bpLive || reducedMotion() || blueprint.packetFlow.length === 0) return;
    let cancelled = false;
    const packetId = { current: 0 };

    function flowOne(pathEl: SVGPathElement | null, color: string, dur: number) {
      const stage = stageRef.current;
      if (!pathEl || !stage) return;
      const len = pathEl.getTotalLength();
      const svg = pathEl.ownerSVGElement;
      if (!svg) return;
      const vb = svg.viewBox.baseVal;
      const rect = stage.getBoundingClientRect();
      const sx = rect.width / vb.width;
      const sy = rect.height / vb.height;
      const id = packetId.current++;
      const t0 = performance.now();
      const move = (now: number) => {
        if (cancelled) return;
        const p = Math.min(1, (now - t0) / dur);
        const pt = pathEl.getPointAtLength(p * len);
        setPackets((prev) => {
          const next = prev.filter((pk) => pk.id !== id);
          if (p < 1) next.push({ id, x: pt.x * sx, y: pt.y * sy, color });
          return next;
        });
        if (p < 1) requestAnimationFrame(move);
        else setPackets((prev) => prev.filter((pk) => pk.id !== id));
      };
      requestAnimationFrame(move);
    }

    function loop() {
      if (cancelled) return;
      let t = 0;
      for (const step of blueprint.packetFlow) {
        setTimeout(() => {
          if (!cancelled) flowOne(wireRefs.current[step.wireId] ?? null, step.color, step.durationMs);
        }, t);
        t += step.durationMs - 120;
      }
      setTimeout(() => {
        if (!cancelled) loop();
      }, t + 700);
    }
    loop();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpLive, blueprint]);

  return (
    <div
      className="rounded-2xl border border-line p-[26px]"
      style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[.13em] text-mute">
          Live agent
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-mute">
          <span
            className={`h-[7px] w-[7px] rounded-full transition-all ${
              bpLive ? "bg-spring shadow-[0_0_0_3px_rgba(var(--color-spring-rgb)/.12)]" : "bg-mute"
            }`}
            style={bpLive ? { animation: "pulse 1.6s infinite" } : undefined}
          />
          {bpStatusText}
        </div>
      </div>

      <div
        ref={stageRef}
        className="relative mx-auto w-full max-w-[330px]"
        style={{ aspectRatio: "360/478" }}
      >
        <svg
          className="absolute inset-0 z-[1] h-full w-full overflow-visible"
          viewBox={blueprint.viewBox}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="flow" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--color-violet-hi)" />
              <stop offset="1" stopColor="var(--color-plasma)" />
            </linearGradient>
          </defs>
          {blueprint.wires.map((wire) => {
            const on = wire.alwaysOn || wireMap[wire.id] || false;
            return (
              <BlueprintWire
                key={wire.id}
                data={wire}
                on={on}
                drawStyle={draw(wire.id, on)}
                ref={
                  wire.needsRef
                    ? (el) => {
                        wireRefs.current[wire.id] = el;
                      }
                    : undefined
                }
              />
            );
          })}
        </svg>

        {packets.map((pk) => (
          <DataPacket key={pk.id} x={pk.x} y={pk.y} color={pk.color} />
        ))}

        {blueprint.nodes.map((node) => {
          const lit = node.alwaysLit || litMap[node.id] || false;
          return (
            <BlueprintNode
              key={node.id}
              data={node}
              lit={lit}
              value={valueMap[node.id]}
              flashStyle={flash(node.id, lit)}
              decoration={
                node.decoration === "temp-pill" ? (
                  <span
                    className={`mt-1.5 inline-block rounded-full border px-[7px] py-0.5 font-mono text-[8.5px] transition-all ${
                      tempOn
                        ? "border-plasma bg-plasma-dim text-plasma"
                        : "border-line bg-panel-3 text-mute"
                    }`}
                  >
                    {tempVal}
                  </span>
                ) : undefined
              }
            />
          );
        })}
      </div>

      <p
        className="mt-1.5 min-h-[30px] text-center font-mono text-[10.5px] leading-[1.5] text-mute [&_b]:text-violet-hi"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: bpCaption }}
      />
    </div>
  );
}
