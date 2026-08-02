"use client";

export interface DataPacketProps {
  x: number;
  y: number;
  color: string;
}

export default function DataPacket({ x, y, color }: DataPacketProps) {
  return (
    <div
      className="pointer-events-none absolute z-[3] h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{ left: x, top: y, background: color, boxShadow: `0 0 10px 2px ${color}` }}
    />
  );
}
