"use client";

import { useEffect } from "react";
import { useGameStore } from "@/lib/store";

export default function TimerTicker() {
  const tick = useGameStore((s) => s.tick);

  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  return null;
}
