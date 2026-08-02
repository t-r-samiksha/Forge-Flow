"use client";

import { useEffect, useRef } from "react";

export interface ConsoleLine {
  id: number;
  type: "ok" | "warn" | "info";
  icon: string;
  msg: string;
  loc?: string;
  /** Optional owning field key — the freeform editor uses it to replace a
   * field's prior line instead of appending duplicates. Ignored by the
   * legacy campaign build, which doesn't set it. */
  field?: string;
}

interface ConsolePanelProps {
  fileName: string;
  lines: ConsoleLine[];
  blocking: number;
  passed: number;
}

const ICON_COLOR: Record<ConsoleLine["type"], string> = {
  ok: "text-spring",
  warn: "text-amber",
  info: "text-plasma",
};

export default function ConsolePanel({ fileName, lines, blocking, passed }: ConsolePanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [lines.length]);

  return (
    <div className="border-t border-line bg-code-bg">
      <div className="flex items-center gap-3.5 border-b border-line px-4 py-2 font-mono text-[10.5px]">
        <span className="uppercase tracking-[.06em] text-dim">Console</span>
        <span
          className={`rounded-full border px-2 py-0.5 ${
            blocking > 0
              ? "border-[rgba(var(--color-amber-rgb)/.3)] text-amber"
              : "border-line-2 text-mute"
          }`}
        >
          {blocking} blocking
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 ${
            passed > 0 ? "border-[rgba(var(--color-spring-rgb)/.3)] text-spring" : "border-line-2 text-mute"
          }`}
        >
          {passed} passed
        </span>
      </div>
      <div
        ref={bodyRef}
        className="max-h-[130px] min-h-[62px] overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-[1.85]"
      >
        {lines.length === 0 ? (
          <div className="flex items-start gap-2.5">
            <span className="text-plasma">▸</span>
            <span className="text-dim">
              watching <b className="text-text">{fileName}</b> — fill the highlighted slots to
              see live checks.
            </span>
          </div>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className="flex items-start gap-2.5"
              style={{ animation: "clinein .3s cubic-bezier(.4,0,.2,1) forwards" }}
            >
              <span className={`flex-shrink-0 ${ICON_COLOR[line.type]}`}>{line.icon}</span>
              <span
                className="text-dim"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: line.msg }}
              />
              {line.loc && <span className="ml-auto pl-3 text-mute">{line.loc}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
