"use client";

import { useState } from "react";
import { chatWithAgent, LyzrNotConfiguredError } from "@/lib/api";
import { useTypewriter } from "@/lib/useTypewriter";

interface TestConsoleProps {
  agentId: string;
  sessionId: string;
}

export default function TestConsole({ agentId, sessionId }: TestConsoleProps) {
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { text, start } = useTypewriter();

  const send = async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setAsked(q);
    try {
      const { response } = await chatWithAgent(agentId, q, sessionId);
      start(response);
    } catch (err) {
      setError(
        err instanceof LyzrNotConfiguredError ? err.message : "Couldn't reach the agent."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-2xl border border-line p-[26px]"
      style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
    >
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[.13em] text-mute">
        Test Console
      </div>
      <h3 className="mb-4 font-display text-lg font-semibold">
        Try your current agent configuration
      </h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="What's the return policy?"
          className="flex-1 rounded-lg border border-line bg-code-bg px-3 py-2.5 font-mono text-[13px] text-text outline-none focus:border-violet"
        />
        <button
          type="button"
          onClick={send}
          disabled={loading}
          className="rounded-lg bg-violet px-4 font-mono text-xs font-semibold text-on-accent transition-transform hover:scale-105 disabled:opacity-50"
        >
          {loading ? "…" : "Send"}
        </button>
      </div>
      {error && <p className="mt-3 font-mono text-xs text-amber">⚠ {error}</p>}
      {asked && !error && (
        <div className="mt-4 rounded-lg border border-line bg-code-bg p-4 font-mono text-[12.5px] leading-[1.7]">
          <div className="mb-2 text-plasma">{asked}</div>
          <div className="text-[var(--color-code-text)]">{text}</div>
        </div>
      )}
    </div>
  );
}
