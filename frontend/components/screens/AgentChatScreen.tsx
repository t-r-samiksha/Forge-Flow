"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  chatWithAgent,
  getAgent,
  LyzrNotConfiguredError,
  type ApiForgedAgent,
} from "@/lib/api";
import { getUserId } from "@/lib/session";
import { getCampaign, resolveAgentConfig, type Campaign } from "@/lib/campaigns";
import { reducedMotion } from "@/lib/effects";
import { useGameStore } from "@/lib/store";
import { freeformChatGreeting, freeformShippedConfig } from "@/lib/freeformAgentView";

interface ChatMessage {
  id: number;
  role: "agent" | "user";
  text: string;
  src?: string;
  error?: boolean;
}

let msgId = 0;

export default function AgentChatScreen({ agentId }: { agentId: string }) {
  const router = useRouter();
  const unlockAchievements = useGameStore((s) => s.unlockAchievements);
  const [agent, setAgentState] = useState<ApiForgedAgent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [typingId, setTypingId] = useState<number | null>(null);
  const [typingText, setTypingText] = useState("");
  const winRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    getAgent(getUserId(), agentId)
      .then(setAgentState)
      .catch(() => setNotFound(true));
  }, [agentId]);

  useEffect(() => {
    if (notFound) router.replace("/campaigns");
  }, [notFound, router]);

  useEffect(() => {
    if (agent && messages.length === 0) {
      const greeting = getCampaign(agent.campaignId)?.chatPage.greeting ?? freeformChatGreeting(agent.name);
      setMessages([{ id: msgId++, role: "agent", text: greeting }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  useEffect(() => {
    winRef.current?.scrollTo({ top: winRef.current.scrollHeight });
  }, [messages, typing, typingText]);

  if (notFound) return null;

  if (!agent) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-24 text-center">
        <p className="text-sm text-dim">Loading agent…</p>
      </div>
    );
  }

  const campaign = getCampaign(agent.campaignId);
  const freeformCfg = campaign ? null : freeformShippedConfig(agent);
  const displayName = campaign?.chatPage.displayName ?? freeformCfg!.name;
  const headerIcon = campaign?.agentCardTemplate.icon ?? "⬡";
  const gradientFrom = campaign?.agentCardTemplate.gradientFrom ?? "var(--color-violet)";
  const gradientTo = campaign?.agentCardTemplate.gradientTo ?? "var(--color-violet-deep)";
  const headerBadges = campaign ? campaign.chatPage.headerBadges(agent.config) : [`role: ${freeformCfg!.role}`];
  const chatChips = campaign?.chatScenarios.slice(0, 3) ?? [];

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || sending) return;
    setInput("");
    setSending(true);
    setMessages((m) => [...m, { id: msgId++, role: "user", text: q }]);
    setTyping(true);

    try {
      const { response, newAchievements } = await chatWithAgent(
        agent.lyzrAgentId,
        q,
        sessionIdRef.current,
        getUserId()
      );
      if (newAchievements?.length) unlockAchievements(newAchievements);
      setTyping(false);

      const responseId = msgId++;
      setMessages((m) => [
        ...m,
        {
          id: responseId,
          role: "agent",
          text: response,
          src: campaign ? campaign.chatPage.sourceLine(agent.config) : undefined,
        },
      ]);

      const reduce = reducedMotion();
      setTypingId(responseId);
      setTypingText("");
      let i = 0;
      const step = () => {
        if (i <= response.length) {
          setTypingText(response.slice(0, i));
          i += reduce ? response.length : 2;
          setTimeout(step, reduce ? 0 : 16);
        } else {
          setTypingId(null);
        }
      };
      step();
    } catch (err) {
      setTyping(false);
      const message =
        err instanceof LyzrNotConfiguredError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't reach the agent.";
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
        <button type="button" className="ccard-btn view" style={{ flex: "none" }} onClick={() => router.push(`/agent/${agentId}/doc`)}>
          📖 View what you learned
        </button>
      </div>

      <div className="chat-layout">
        <div className="chat-shell">
          <div className="chat-head">
            <div className="chat-head-l">
              <div
                className="chat-av"
                style={{
                  background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
                }}
              >
                {headerIcon}
              </div>
              <div>
                <b>{displayName}</b>
                <div className="chat-head-sub">
                  {headerBadges.map((badge) => (
                    <span key={badge}>{badge}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="chat-live">
              <i />
              online
            </div>
          </div>

          <div ref={winRef} className="chat-window">
            {messages.map((m) => (
              <div key={m.id} className={`chat-bubble ${m.role === "user" ? "user" : "agent"}`}>
                {m.id === typingId ? typingText : m.text}
                {m.src && m.id !== typingId && <span className="chat-src">{m.src}</span>}
              </div>
            ))}
            {typing && (
              <div className="chat-typing">
                <i />
                <i />
                <i />
              </div>
            )}
          </div>

          {chatChips.length > 0 && (
            <div className="chat-chips">
              {chatChips.map((s) => (
                <button key={s.q} type="button" className="chat-chip" disabled={sending} onClick={() => send(s.q)}>
                  {s.q}
                </button>
              ))}
            </div>
          )}

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
              placeholder="Ask it something…"
            />
            <button type="button" className="chat-send" onClick={() => send(input)} disabled={sending || !input.trim()}>
              Send
            </button>
          </div>

          <p className="chat-footnote">
            Powered by <b>Lyzr</b> — talking to the real agent you shipped, answering only from
            what it was forged to know.
          </p>
        </div>

        <ChatConfigSidebar agent={agent} campaign={campaign} />
      </div>
    </div>
  );
}

function ChatConfigSidebar({
  agent,
  campaign,
}: {
  agent: ApiForgedAgent;
  campaign: Campaign | undefined;
}) {
  const freeformCfg = campaign ? null : freeformShippedConfig(agent);
  const current = campaign ? resolveAgentConfig(campaign, agent.config) : freeformCfg!;
  const original = campaign ? resolveAgentConfig(campaign, agent.originalConfig) : freeformCfg!;
  const finalized = agent.version > 1 || !!agent.lastEditedAt;
  // Freeform agents don't go through the campaign slot-diff system (no
  // originalConfig/config distinction — both are always {}), so there's
  // nothing real to diff against; only campaign agents can show "what changed".
  const changed =
    !!campaign &&
    (current.instructions !== original.instructions ||
      current.model !== original.model ||
      current.temperature !== original.temperature);

  return (
    <aside className="chat-cfg">
      <div className="chat-cfg-head">⚙️ Live configuration</div>
      <span className={`chat-cfg-status ${finalized ? "finalized" : "shipped"}`}>
        {finalized ? `✓ finalized · v${agent.version}` : `🔨 shipped · v${agent.version}`}
      </span>
      <ConfigRow label="name" value={agent.name} />
      <ConfigRow label="role" value={campaign ? campaign.lyzrConfig.role : freeformCfg!.role} />
      <ConfigRow label="model" value={current.model} />
      <ConfigRow label="temperature" value={String(current.temperature)} />
      <ConfigRow label="instruction" value={current.instructions} />
      {changed && (
        <div className="chat-cfg-diff">
          <b>What changed:</b> temp {original.temperature} → {current.temperature}
          {original.model !== current.model && (
            <>
              <br />
              model {original.model} → {current.model}
            </>
          )}
          <br />
          instruction {current.instructions.length >= original.instructions.length ? "+" : ""}
          {current.instructions.length - original.instructions.length} chars
        </div>
      )}
    </aside>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="chat-cfg-row">
      <label>{label}</label>
      <div className="val" style={{ maxHeight: 110, overflowY: "auto" }}>
        {value || "—"}
      </div>
    </div>
  );
}
