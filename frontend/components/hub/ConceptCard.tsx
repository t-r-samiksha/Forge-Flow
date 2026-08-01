"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ConceptCardProps {
  summary: string;
  deepDiveUrl: string;
}

export default function ConceptCard({ summary, deepDiveUrl }: ConceptCardProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-5 rounded-xl border border-[rgba(var(--color-violet-rgb)/.25)] bg-violet-dim p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[.08em] text-violet-hi">
          📚 What you learned
        </span>
        <span className="text-xs text-violet-hi">{open ? "−" : "+"}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <p className="mt-3 text-[13px] leading-[1.6] text-dim">{summary}</p>
            <a
              href={deepDiveUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block font-mono text-xs text-plasma hover:underline"
            >
              Deep dive →
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
