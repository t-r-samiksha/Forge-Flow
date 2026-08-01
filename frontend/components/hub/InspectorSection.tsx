"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import type { InspectorSection as InspectorSectionData } from "@/lib/campaigns";
import type { InspectorMode } from "@/lib/store";
import ConceptCard from "./ConceptCard";
import ConfigDiff from "./ConfigDiff";

interface InspectorSectionProps {
  section: InspectorSectionData;
  mode: InspectorMode;
  originalConfig: Record<string, string>;
  liveConfig: Record<string, string>;
  onSlotChange: (key: string, value: string) => void;
}

export default function InspectorSection({
  section,
  mode,
  originalConfig,
  liveConfig,
  onSlotChange,
}: InspectorSectionProps) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="rounded-2xl border border-line p-[26px]"
      style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
    >
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[.13em] text-mute">
        {section.pillar}
      </div>
      <h3 className="mb-4 font-display text-lg font-semibold">{section.title}</h3>

      <ConceptCard summary={section.conceptSummary} deepDiveUrl={section.deepDiveUrl} />

      <div className="flex flex-col gap-5">
        {section.slots.map((slot) => {
          const value = liveConfig[slot.key] ?? "";
          const original = originalConfig[slot.key] ?? "";
          return (
            <div key={slot.key}>
              <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-[.06em] text-mute">
                {slot.label}
              </label>
              {mode === "study" ? (
                <div className="rounded-lg border border-line bg-code-bg px-3 py-2.5 font-mono text-[13px] text-text">
                  {value || <span className="text-mute">—</span>}
                </div>
              ) : slot.kind === "select" ? (
                <select
                  value={value}
                  onChange={(e) => onSlotChange(slot.key, e.target.value)}
                  className="w-full rounded-lg border border-line bg-code-bg px-3 py-2.5 font-mono text-[13px] text-text outline-none focus:border-violet"
                >
                  {slot.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : slot.kind === "textarea" ? (
                <textarea
                  value={value}
                  onChange={(e) => onSlotChange(slot.key, e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-line bg-code-bg px-3 py-2.5 font-mono text-[13px] text-text outline-none focus:border-violet"
                />
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => onSlotChange(slot.key, e.target.value)}
                  className="w-full rounded-lg border border-line bg-code-bg px-3 py-2.5 font-mono text-[13px] text-text outline-none focus:border-violet"
                />
              )}
              <ConfigDiff original={original} current={value} label={slot.label} />
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
