"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Compass, X, Send } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { getCampaign, globalMentorDefault, mentorAnswers, type MentorDefault } from "@/lib/campaigns";
import { chatWithMentor } from "@/lib/api";
import { getUserId } from "@/lib/session";

const SCREEN_KEYS = ["story", "setup", "build", "ship"] as const;
type ScreenKey = (typeof SCREEN_KEYS)[number];

function isScreenKey(v: string): v is ScreenKey {
  return (SCREEN_KEYS as readonly string[]).includes(v);
}

/** Same resolution the app has always used: story/setup/build/ship map to
 * that campaign's own mentor default, /campaigns gets the app-level
 * default, and anything else (e.g. /agent/:id/doc, /agent/:id/chat)
 * falls back to Retriever's build context — preserved as-is rather than
 * "fixed," since Part A is a reshape, not a behavior change. */
function resolveMentor(pathname: string): { mentor: MentorDefault; mentorKey: string } {
  const segments = pathname.split("/");
  const screen = segments[1] || "story";

  if (screen === "campaigns") {
    return { mentor: globalMentorDefault, mentorKey: "campaigns" };
  }
  if (isScreenKey(screen)) {
    const campaignId = segments[2];
    const campaign = (campaignId && getCampaign(campaignId)) || getCampaign("retriever")!;
    return { mentor: campaign.mentor[screen], mentorKey: screen };
  }
  return { mentor: getCampaign("retriever")!.mentor.build, mentorKey: "build" };
}

interface ChatMsg {
  id: number;
  role: "mentor" | "user";
  text: string;
}

let msgId = 0;

export default function MentorPanel() {
  const mentorOpen = useGameStore((s) => s.mentorOpen);
  const toggleMentor = useGameStore((s) => s.toggleMentor);
  const activeContext = useGameStore((s) => s.activeContext);
  const activeAgentId = useGameStore((s) => s.activeAgentId);
  const unlockAchievements = useGameStore((s) => s.unlockAchievements);
  const pathname = usePathname();
  const { mentor, mentorKey } = resolveMentor(pathname);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [typing, setTyping] = useState(false);
  const [asking, setAsking] = useState(false);
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  const context = mentorKey === "build" && activeContext ? activeContext : mentor.ctx;
  // Same gate as context — only a "build"-key screen (which includes an
  // agent's Doc page; see resolveMentor's fallback) can have a real
  // agent in focus for Nova to ground on.
  const agentIdForMentor = mentorKey === "build" ? activeAgentId : null;

  useEffect(() => {
    setMessages([]);
    setTyping(false);
  }, [mentorKey]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, typing]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || asking) return;
    setInput("");
    setAsking(true);
    setMessages((m) => [...m, { id: msgId++, role: "user", text: q }]);
    setTyping(true);

    try {
      const { response, newAchievements } = await chatWithMentor(
        q,
        context,
        getUserId(),
        sessionIdRef.current,
        agentIdForMentor
      );
      if (newAchievements?.length) unlockAchievements(newAchievements);
      setTyping(false);
      setMessages((m) => [...m, { id: msgId++, role: "mentor", text: response }]);
    } catch {
      // Real Nova call failed (network, 503 not-configured, etc.) — fall back
      // to the local scripted answers with no visible error, same UX as before.
      setTyping(false);
      setMessages((m) => [
        ...m,
        { id: msgId++, role: "mentor", text: mentorAnswers[q] ?? mentorAnswers.default! },
      ]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={toggleMentor}
        className="fixed bottom-6 right-6 z-[180] flex items-center gap-[9px] rounded-full px-5 py-3.5 font-body text-[13.5px] font-semibold text-on-accent shadow-[0_10px_30px_rgba(var(--color-violet-rgb)/.45)] transition-transform hover:-translate-y-[3px]"
        style={{ background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))" }}
      >
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full bg-spring"
          style={{ boxShadow: "0 0 0 3px rgba(var(--color-spring-rgb)/.3)", animation: "pulse 1.6s infinite" }}
        />
        Ask Nova
      </button>

      <div
        className={`fixed right-0 top-0 z-[200] flex h-full w-[372px] max-w-[92vw] flex-col border-l border-line bg-panel transition-transform duration-[420ms] ease-[cubic-bezier(.4,0,.2,1)] ${
          mentorOpen ? "translate-x-0 shadow-[-20px_0_60px_rgba(var(--color-shadow-rgb)/.5)]" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line p-5">
          <div className="flex items-center gap-[11px]">
            <div
              className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px]"
              style={{ background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))" }}
            >
              <Compass size={18} className="text-on-accent" />
            </div>
            <div>
              <b className="block font-display text-sm">Nova</b>
              <span className="font-mono text-[10.5px] text-spring">
                · context-aware mentor
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleMentor}
            className="text-mute transition-colors hover:text-text"
          >
            <X size={20} />
          </button>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto p-[18px]">
          <div className="mb-4 rounded-lg bg-violet-dim px-[11px] py-2 font-mono text-[10px] tracking-[.02em] text-violet-hi">
            Context · {mentor.ctx}
          </div>
          <div
            key={mentorKey}
            className="mb-3 rounded-xl rounded-tl-[3px] border border-line bg-panel-2 px-[15px] py-[13px] text-[13px] leading-[1.6] text-dim"
            style={{ animation: "msgin .3s cubic-bezier(.4,0,.2,1)" }}
          >
            {mentor.msg}
          </div>

          {messages.map((m) =>
            m.role === "user" ? (
              <div
                key={m.id}
                className="mb-3 ml-9 rounded-xl rounded-tr-[3px] border border-[rgba(var(--color-violet-rgb)/.3)] bg-violet-dim px-[15px] py-[13px] text-[13px] leading-[1.6] text-text"
                style={{ animation: "msgin .3s cubic-bezier(.4,0,.2,1)" }}
              >
                {m.text}
              </div>
            ) : (
              <div
                key={m.id}
                className="mb-3 rounded-xl rounded-tl-[3px] border border-line bg-panel-2 px-[15px] py-[13px] text-[13px] leading-[1.6] text-dim"
                style={{ animation: "msgin .3s cubic-bezier(.4,0,.2,1)" }}
              >
                {m.text}
              </div>
            )
          )}

          {typing && (
            <div className="flex gap-1 px-[15px] py-[13px]">
              <span
                className="h-[7px] w-[7px] rounded-full bg-mute"
                style={{ animation: "typ 1.2s infinite", animationDelay: "0ms" }}
              />
              <span
                className="h-[7px] w-[7px] rounded-full bg-mute"
                style={{ animation: "typ 1.2s infinite", animationDelay: "200ms" }}
              />
              <span
                className="h-[7px] w-[7px] rounded-full bg-mute"
                style={{ animation: "typ 1.2s infinite", animationDelay: "400ms" }}
              />
            </div>
          )}

          {messages.length === 0 && !typing && (
            <div className="flex flex-col gap-[7px]">
              {mentor.sugg.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={asking}
                  onClick={() => ask(s)}
                  className="rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-left text-xs text-dim transition-all hover:translate-x-[3px] hover:border-violet hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-line p-[14px]">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") ask(input);
            }}
            disabled={asking}
            placeholder="Ask about this step…"
            className="flex-1 rounded-[10px] border border-line bg-panel-2 px-[13px] py-[11px] text-[13px] text-text outline-none focus:border-violet disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => ask(input)}
            disabled={asking || !input.trim()}
            className="flex items-center justify-center rounded-[10px] bg-violet px-[15px] text-on-accent transition-transform hover:scale-[1.08] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </>
  );
}
