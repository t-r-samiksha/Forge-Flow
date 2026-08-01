"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ToastDetail } from "@/lib/effects";

export default function Toast() {
  const [toast, setToast] = useState<ToastDetail | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout>;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      setToast(detail);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setToast(null), 1900);
    };
    window.addEventListener("forge:toast", onToast);
    return () => {
      window.removeEventListener("forge:toast", onToast);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          className="fixed left-1/2 top-6 z-[220] flex items-center gap-2.5 rounded-xl border border-spring bg-panel px-[22px] py-[13px] font-mono text-[13px] text-spring shadow-[0_14px_40px_rgba(var(--color-shadow-rgb)/.5)]"
          initial={{ x: "-50%", y: "-160%" }}
          animate={{ x: "-50%", y: 0 }}
          exit={{ x: "-50%", y: "-160%" }}
          transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <span className="font-bold">{toast.xpText}</span>
          <span>· {toast.msg}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
