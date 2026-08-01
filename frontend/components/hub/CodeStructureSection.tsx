"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { highlightJson } from "@/lib/highlightJson";

export default function CodeStructureSection({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(payload, null, 2);

  const copy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className="rounded-2xl border border-line p-[26px]"
      style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="font-mono text-[10.5px] uppercase tracking-[.13em] text-mute">
          Code Structure
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md border border-line-2 bg-panel px-3 py-1.5 text-xs text-dim transition-colors hover:border-violet hover:text-text"
        >
          <Copy size={13} /> {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <h3 className="mb-1 font-display text-lg font-semibold">
        The exact payload sent to Lyzr
      </h3>
      <p className="mb-4 text-[13px] text-dim">
        This is the real request body from your last Ship Day forge or re-forge — not a
        reconstruction.
      </p>
      <pre className="overflow-x-auto rounded-xl border border-line bg-code-bg p-4 font-mono text-[12.5px] leading-[1.7]">
        {/* eslint-disable-next-line react/no-danger */}
        <code dangerouslySetInnerHTML={{ __html: highlightJson(payload) }} />
      </pre>
    </div>
  );
}
