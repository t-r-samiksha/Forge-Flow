"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCampaign, type StorySegment } from "@/lib/campaigns";
import { reducedMotion } from "@/lib/effects";

type Token =
  | { type: "char"; ch: string; cls?: string }
  | { type: "br" };

function beatToTokens(segments: StorySegment[]): Token[] {
  const tokens: Token[] = [];
  for (const seg of segments) {
    if (seg === "br") {
      tokens.push({ type: "br" });
      continue;
    }
    for (const ch of seg.text) {
      tokens.push({ type: "char", ch, cls: seg.cls });
    }
  }
  return tokens;
}

const CLS_MAP: Record<string, string> = {
  em: "text-amber",
  "em-v": "text-violet-hi",
  "em-r": "text-rose",
};

export default function StoryScreen({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const campaign = getCampaign(campaignId)!;
  const storyBeats = campaign.story.beats;

  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [typing, setTyping] = useState(true);
  const [statsVisible, setStatsVisible] = useState(false);
  const [ticketCount, setTicketCount] = useState(0);

  const beat = storyBeats[idx]!;
  const tokens = useMemo(() => beatToTokens(beat.segments), [beat]);

  const revealTimer = useRef<ReturnType<typeof setTimeout>>();
  const countRaf = useRef<number>();

  useEffect(() => {
    setRevealed(0);
    setStatsVisible(false);
    setTyping(true);

    if (reducedMotion()) {
      setRevealed(tokens.length);
      setTyping(false);
      if (beat.stats) {
        setStatsVisible(true);
        setTicketCount(2418);
      }
      return;
    }

    let i = 0;
    const reveal = () => {
      if (i < tokens.length) {
        i++;
        setRevealed(i);
        revealTimer.current = setTimeout(reveal, 14);
      } else {
        setTyping(false);
        if (beat.stats) {
          setStatsVisible(true);
          const t0 = performance.now();
          const dur = 900;
          const tick = (now: number) => {
            const p = Math.min(1, (now - t0) / dur);
            setTicketCount(Math.round(2418 * p));
            if (p < 1) countRaf.current = requestAnimationFrame(tick);
          };
          countRaf.current = requestAnimationFrame(tick);
        }
      }
    };
    reveal();

    return () => {
      clearTimeout(revealTimer.current);
      if (countRaf.current) cancelAnimationFrame(countRaf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const finishTyping = () => {
    setRevealed(tokens.length);
    setTyping(false);
    if (beat.stats) {
      setStatsVisible(true);
      setTicketCount(2418);
    }
  };

  const advance = () => {
    if (typing) {
      finishTyping();
      return;
    }
    if (idx < storyBeats.length - 1) {
      setIdx((i) => i + 1);
    } else {
      router.push("/campaigns");
    }
  };

  const isLast = idx === storyBeats.length - 1;
  const shown = tokens.slice(0, revealed);

  return (
    <div className="mx-auto max-w-[760px] px-6 py-16">
      <div className="mb-[26px] flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[.2em] text-rose">
        <span
          aria-hidden="true"
          className="h-[9px] w-[9px] rounded-full bg-rose"
          style={{ animation: "recpulse 1.4s infinite" }}
        />
        Field assignment · Meridian Labs
      </div>

      <div className="relative overflow-hidden rounded-[18px] border border-line p-10 backdrop-blur-md"
        style={{
          background:
            "linear-gradient(180deg, rgba(var(--color-glass-1-rgb)/.6), rgba(var(--color-glass-2-rgb)/.6))",
        }}
      >
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 top-0 w-[3px]"
          style={{ background: "linear-gradient(180deg, var(--color-rose), var(--color-violet))" }}
        />
        <div className="min-h-[130px] font-display text-[clamp(19px,2.6vw,26px)] font-medium leading-[1.5] tracking-[-0.01em] text-text">
          {shown.map((tok, i) =>
            tok.type === "br" ? (
              <br key={i} />
            ) : (
              <span key={i} className={tok.cls ? CLS_MAP[tok.cls] : undefined}>
                {tok.ch}
              </span>
            )
          )}
          {typing && (
            <span
              className="ml-[3px] inline-block h-[1.05em] w-[9px] bg-violet-hi align-[-3px]"
              style={{ animation: "blink 1s steps(2) infinite" }}
            />
          )}
        </div>

        <div
          className={`mt-[30px] flex flex-wrap gap-3.5 transition-opacity duration-500 ${
            statsVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="min-w-[150px] flex-1 rounded-xl border border-line bg-panel-2 px-[18px] py-4">
            <div className="font-mono text-2xl font-bold leading-none text-rose">
              {ticketCount.toLocaleString()}
            </div>
            <div className="mt-[7px] font-mono text-[11px] text-mute">
              tickets in backlog
            </div>
          </div>
          <div className="min-w-[150px] flex-1 rounded-xl border border-line bg-panel-2 px-[18px] py-4">
            <div className="font-mono text-2xl font-bold leading-none text-amber">
              31 hrs
            </div>
            <div className="mt-[7px] font-mono text-[11px] text-mute">
              avg. wait time
            </div>
          </div>
          <div className="min-w-[150px] flex-1 rounded-xl border border-line bg-panel-2 px-[18px] py-4">
            <div className="font-mono text-2xl font-bold leading-none text-spring">
              1
            </div>
            <div className="mt-[7px] font-mono text-[11px] text-mute">
              engineer assigned — you
            </div>
          </div>
        </div>
      </div>

      <div className="mt-[30px] flex flex-wrap items-center justify-between gap-3.5">
        <button
          type="button"
          onClick={() => router.push("/campaigns")}
          className="font-mono text-xs text-mute transition-colors hover:text-dim"
        >
          skip intro →
        </button>
        <div className="flex gap-2">
          {storyBeats.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === idx
                  ? "w-[22px] bg-violet-hi shadow-[0_0_10px_var(--color-violet-hi)]"
                  : "w-2 bg-line-2"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={advance}
          className="rounded-[10px] px-[26px] py-3 text-sm font-semibold text-on-accent transition-transform hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
            boxShadow: "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)",
          }}
        >
          {isLast ? "Accept the assignment →" : "Continue →"}
        </button>
      </div>
    </div>
  );
}
