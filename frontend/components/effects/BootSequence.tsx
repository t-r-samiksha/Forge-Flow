"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "@/lib/store";

const SESSION_KEY = "forge:booted";

const LINES: { text: string; delay: number; tone: "dim" | "ok" }[] = [
  { text: "Initializing Meridian Labs environment…", delay: 0.4, tone: "dim" },
  { text: "✓ Neural pathways loaded", delay: 0.8, tone: "ok" },
  { text: "✓ Blueprint engine online", delay: 1.2, tone: "ok" },
  { text: "✓ Lyzr connection verified", delay: 1.6, tone: "ok" },
  { text: "Ready to forge →", delay: 2.0, tone: "dim" },
];

const DISMISS_MS = 2600;

export default function BootSequence() {
  const booted = useGameStore((s) => s.booted);
  const setBooted = useGameStore((s) => s.setBooted);
  const [visible, setVisible] = useState(true);

  // Runs before paint: if this browser tab already sat through the boot
  // sequence once this session, skip it instantly so a hard refresh never
  // re-masks the destination page's own entrance animations behind the
  // curtain again.
  useLayoutEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) {
      setBooted(true);
      setVisible(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (booted) return;
    const timeout = setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, "1");
      setBooted(true);
      setVisible(false);
    }, DISMISS_MS);
    return () => clearTimeout(timeout);
  }, [booted, setBooted]);

  return (
    <AnimatePresence>
      {!booted && visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-void"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <div className="w-[min(540px,88vw)] font-mono text-[13px] leading-[2.05]">
            <motion.div
              className="mb-5 text-[15px] font-bold uppercase tracking-[.24em] text-violet-hi"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            >
              ⬡ ForgeFlow
            </motion.div>
            {LINES.map((line) => (
              <motion.p
                key={line.text}
                className={line.tone === "ok" ? "mb-0 text-spring" : "mb-0 text-mute"}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: line.delay, duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                {line.text}
              </motion.p>
            ))}
            <div className="relative mt-[18px] h-[3px] overflow-hidden rounded-full bg-panel-2">
              <motion.div
                className="h-full"
                style={{
                  background: "linear-gradient(90deg, var(--color-violet), var(--color-plasma))",
                  boxShadow: "0 0 14px rgba(var(--color-violet-rgb)/.7)",
                }}
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ delay: 0.5, duration: 2, ease: [0.4, 0, 0.2, 1] }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
