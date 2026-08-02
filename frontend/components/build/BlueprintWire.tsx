"use client";

import { forwardRef, type CSSProperties } from "react";
import type { BlueprintWireData } from "@/lib/campaigns";

const wireBase = "fill-none stroke-line-2 stroke-2 transition-[stroke] duration-500";
const wireOn =
  "stroke-[url(#flow)] stroke-[2.5px] [stroke-dasharray:6_8] [animation:dashflow_1s_linear_infinite] [filter:drop-shadow(0_0_3px_rgba(var(--color-plasma-rgb)/.5))]";

export interface BlueprintWireProps {
  data: BlueprintWireData;
  on: boolean;
  drawStyle?: CSSProperties;
}

const BlueprintWire = forwardRef<SVGPathElement, BlueprintWireProps>(function BlueprintWire(
  { data, on, drawStyle },
  ref
) {
  return (
    <path
      ref={ref}
      className={`${wireBase} ${on ? wireOn : ""}`}
      style={drawStyle}
      d={data.path}
    />
  );
});

export default BlueprintWire;
