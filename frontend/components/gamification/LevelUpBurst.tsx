"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export default function LevelUpBurst() {
  const [rank, setRank] = useState<string | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout>;
    const onLevelUp = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setRank(null);
      requestAnimationFrame(() => setRank(detail));
      clearTimeout(hideTimer);
      // reference's luflash is a single 1.6s keyframe: 0-20% enter, 20-80%
      // hold, 80-100% exit. Enter/exit here are each 0.32s (20% of 1.6s),
      // so triggering exit at 1.28s makes the whole cycle land on 1.6s.
      hideTimer = setTimeout(() => setRank(null), 1280);
    };
    window.addEventListener("forge:levelup", onLevelUp);
    return () => {
      window.removeEventListener("forge:levelup", onLevelUp);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <AnimatePresence>
      {rank && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[215] flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
        >
          <div
            className="font-display text-[clamp(30px,6vw,64px)] font-bold uppercase tracking-[.06em]"
            style={{
              background: "linear-gradient(120deg, var(--color-violet-hi), var(--color-plasma))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Level up · {rank}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
