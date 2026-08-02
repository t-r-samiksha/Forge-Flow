"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chatWithCrew, getCrew, LyzrNotConfiguredError, type CrewInfo } from "@/lib/api";
import { getUserId } from "@/lib/session";
import { useGameStore } from "@/lib/store";

interface ChatMessage {
  id: number;
  role: "agent" | "user";
  text: string;
  routedTo?: string | null;
  error?: boolean;
}

let msgId = 0;

/** Deployed-crew chat — the real routing loop from FORGEFLOW_V3_SPEC.md §6.
 * Adapted from AgentChatScreen's markup/CSS (same .chat-shell/.chat-bubble
 * classes for visual consistency) rather than reusing it directly: a crew
 * has no single ApiForgedAgent/campaignId, so AgentChatScreen's data model
 * doesn't fit — every message here goes through POST /api/crew/:id/chat,
 * not /api/agent/chat. */
export default function CrewChatScreen({ crewId }: { crewId: string }) {
  const router = useRouter();
  const unlockAchievements = useGameStore((s) => s.unlockAchievements);
  const [crew, setCrew] = useState<CrewInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);
  const winRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    getCrew(crewId)
      .then(setCrew)
      .catch(() => setNotFound(true));
  }, [crewId]);

  useEffect(() => {
    if (notFound) router.replace("/campaigns");
  }, [notFound, router]);

  useEffect(() => {
    if (crew && messages.length === 0) {
      setMessages([
        {
          id: msgId++,
          role: "agent",
          text: `Hi — I'm the orchestrator for this crew. Ask me anything; I'll answer directly or route you to the right specialist.`,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crew]);

  useEffect(() => {
    winRef.current?.scrollTo({ top: winRef.current.scrollHeight });
  }, [messages]);

  if (notFound) return null;
  if (!crew) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-24 text-center">
        <p className="text-sm text-dim">Loading crew…</p>
      </div>
    );
  }

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || sending) return;
    setInput("");
    setSending(true);
    setNotConfigured(false);
    setMessages((m) => [...m, { id: msgId++, role: "user", text: q }]);

    try {
      const { response, routedTo, newAchievements } = await chatWithCrew(
        crewId,
        q,
        sessionIdRef.current,
        getUserId()
      );
      if (newAchievements?.length) unlockAchievements(newAchievements);
      setMessages((m) => [...m, { id: msgId++, role: "agent", text: response, routedTo }]);
    } catch (err) {
      if (err instanceof LyzrNotConfiguredError) {
        setNotConfigured(true);
      }
      const message =
        err instanceof LyzrNotConfiguredError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't reach the crew.";
      setMessages((m) => [...m, { id: msgId++, role: "agent", text: `⚠ ${message}`, error: true }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-16">
      <div className="subnav">
        <button type="button" className="back-link" onClick={() => router.push("/campaigns")}>
          ← back to ForgeFlow
        </button>
      </div>

      <div className="chat-layout">
        <div className="chat-shell">
          <div className="chat-head">
            <div className="chat-head-l">
              <div
                className="chat-av"
                style={{ background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))" }}
              >
                🕸️
              </div>
              <div>
                <b>{crew.crew.name || "Crew orchestrator"}</b>
                <div className="chat-head-sub">
                  <span>{crew.members.length} specialist{crew.members.length === 1 ? "" : "s"}</span>
                </div>
              </div>
            </div>
            <div className="chat-live">
              <i />
              online
            </div>
          </div>

          {notConfigured && (
            <div className="mx-4 mt-3 rounded-xl border border-amber/40 bg-[rgba(var(--color-amber-rgb)/.08)] px-4 py-2.5 font-mono text-xs text-amber">
              ⚠ Lyzr isn&apos;t configured — add a real <code>LYZR_API_KEY</code> to chat live.
            </div>
          )}

          <div ref={winRef} className="chat-window">
            {messages.map((m) => (
              <div key={m.id} className={`chat-bubble ${m.role === "user" ? "user" : "agent"}`}>
                {m.text}
                {m.routedTo && <span className="chat-src">↪ routed to {m.routedTo}</span>}
              </div>
            ))}
          </div>

          <div className="chat-input-row">
            <input
              type="text"
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send(input);
              }}
              disabled={sending}
              placeholder="Ask the crew something…"
            />
            <button type="button" className="chat-send" onClick={() => send(input)} disabled={sending || !input.trim()}>
              Send
            </button>
          </div>

          <p className="chat-footnote">
            Powered by <b>Lyzr</b> — a real orchestrator agent that may hand off to a real specialist,
            mid-conversation, based on what you actually asked.
          </p>
        </div>

        <aside className="chat-cfg">
          <div className="chat-cfg-head">🕸️ Crew composition</div>
          <div className="chat-cfg-row">
            <label>orchestrator</label>
            <div className="val">{crew.crew.orchestrator_agent_id}</div>
          </div>
          {crew.members.map((m) => (
            <div className="chat-cfg-row" key={m.forged_agent_id}>
              <label>{m.role_label}</label>
              <div className="val">{m.forged_agent_id}</div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
