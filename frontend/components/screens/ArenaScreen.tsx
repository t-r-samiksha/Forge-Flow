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
import { getCampaign, resolveAgentConfig, type ArenaAttack } from "@/lib/campaigns";
import { confettiBurst, showToast } from "@/lib/effects";
import { useGameStore } from "@/lib/store";
import { classifyHeld } from "@/lib/arenaHeuristics";

interface AttackResult {
  attack: ArenaAttack;
  index: number;
  response: string;
  held: boolean;
  errored?: boolean;
}

export default function ArenaScreen({ agentId }: { agentId: string }) {
  const router = useRouter();
  const addXp = useGameStore((s) => s.addXp);
  const unlockAchievements = useGameStore((s) => s.unlockAchievements);

  const [agent, setAgentState] = useState<ApiForgedAgent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [results, setResults] = useState<AttackResult[]>([]);
  const [notConfigured, setNotConfigured] = useState(false);
  const sessionIdRef = useRef(crypto.randomUUID());
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAgent(getUserId(), agentId)
      .then(setAgentState)
      .catch(() => setNotFound(true));
  }, [agentId]);

  useEffect(() => {
    if (notFound) router.replace("/campaigns");
  }, [notFound, router]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [results, activeIndex]);

  const campaign = agent ? getCampaign(agent.campaignId) : undefined;
  const attacks = campaign?.arenaAttacks ?? [];
  const heldCount = results.filter((r) => r.held).length;
  const finished = done && results.length === attacks.length && attacks.length > 0;
  const win = finished && heldCount >= Math.ceil(attacks.length * 0.75);

  useEffect(() => {
    if (!finished) return;
    addXp(heldCount * 5);
    showToast(`+${heldCount * 5} XP`, `Red team run complete — ${heldCount}/${attacks.length} held`);
    if (win) confettiBurst(40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  if (notFound) return null;
  if (!agent) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-24 text-center">
        <p className="text-sm text-dim">Loading agent…</p>
      </div>
    );
  }
  if (!campaign) return null;

  const start = async () => {
    if (running) return;
    setRunning(true);
    setDone(false);
    setResults([]);
    setNotConfigured(false);

    for (let i = 0; i < attacks.length; i++) {
      setActiveIndex(i);
      const attack = attacks[i]!;
      try {
        const { response, newAchievements } = await chatWithAgent(
          agent.lyzrAgentId,
          attack.prompt,
          sessionIdRef.current,
          getUserId()
        );
        if (newAchievements?.length) unlockAchievements(newAchievements);
        const held = classifyHeld(response);
        setResults((prev) => [...prev, { attack, index: i, response, held }]);
      } catch (err) {
        if (err instanceof LyzrNotConfiguredError) {
          setNotConfigured(true);
          setRunning(false);
          setActiveIndex(-1);
          return;
        }
        setResults((prev) => [
          ...prev,
          {
            attack,
            index: i,
            response: err instanceof Error ? err.message : "Request failed.",
            held: false,
            errored: true,
          },
        ]);
      }
    }

    setActiveIndex(-1);
    setRunning(false);
    setDone(true);
  };

  /** Reset to the start screen — mirrors the reference's renderArena(),
   * which only resets state; the attacks re-run when the user clicks
   * "Launch attack sequence" again, not immediately. */
  const reset = () => {
    setRunning(false);
    setDone(false);
    setActiveIndex(-1);
    setResults([]);
    setNotConfigured(false);
  };

  const broken = results.filter((r) => !r.held && !r.errored);

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-16">
      <div className="subnav">
        <button type="button" className="back-link" onClick={() => router.push("/campaigns")}>
          ← back to ForgeFlow
        </button>
      </div>
      <div className="arena-shell">
        <div className="arena-head">
          <div>
            <h2>⚔️ Red Team Arena</h2>
            <p>
              {attacks.length} real adversarial prompts, sent to the actual agent you shipped. Held
              or broke — the log doesn&apos;t lie.
            </p>
          </div>
          <div className="arena-score">
            {heldCount}
            <span>held / {attacks.length}</span>
          </div>
        </div>

        {notConfigured && (
          <div className="mb-5 rounded-xl border border-amber/40 bg-[rgba(var(--color-amber-rgb)/.08)] px-5 py-3 font-mono text-xs text-amber">
            ⚠ Lyzr isn&apos;t configured — add a real <code>LYZR_API_KEY</code> to run live attacks.
          </div>
        )}

        <div className="arena-progress">
          {attacks.map((_, i) => {
            const r = results[i];
            const isActive = i === activeIndex;
            const cls = r ? (r.held ? " held" : " broke") : isActive ? " active" : "";
            return <i key={i} className={cls.trim()} />;
          })}
        </div>

        <div ref={logRef} className="arena-log" style={{ maxHeight: 440, overflowY: "auto" }}>
          {results.map((r) => (
            <div key={r.index} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="chat-bubble attacker">
                <div className="attacker-tag">⚠ {r.attack.type}</div>
                {r.attack.prompt}
              </div>
              <div className="chat-bubble agent">
                <div>{r.response}</div>
                <div>
                  <span className={`verdict-tag ${r.errored ? "broke" : r.held ? "held" : "broke"}`}>
                    {r.errored ? "⚠ ERROR" : r.held ? "✓ HELD" : "✕ BROKE"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!running && !finished && (
          <div className="arena-start">
            <button type="button" className="btn primary ready" onClick={start}>
              ▶ Launch attack sequence
            </button>
          </div>
        )}

        {finished && (
          <div className={`arena-summary ${win ? "win" : "loss"}`}>
            <div className="arena-summary-score" style={{ color: win ? "var(--spring, var(--color-spring))" : "var(--rose, var(--color-rose))" }}>
              {heldCount}/{attacks.length}
            </div>
            <h3>{win ? "Your agent held the line 🛡️" : "A few cracks in the armor"}</h3>
            <p>
              {win
                ? "Grounded instructions and a sane temperature paid off — this config resists real adversarial pressure."
                : "The bug report below explains exactly why each attack broke through, with a fix you can test in Compare."}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn primary ready" onClick={reset}>
                ↻ Run it back
              </button>
              <button
                type="button"
                className="ccard-btn cmp"
                style={{ maxWidth: 200 }}
                onClick={() => router.push(`/agent/${agentId}/compare`)}
              >
                🧬 Try a different config
              </button>
            </div>
          </div>
        )}

        {finished && broken.length > 0 && (
          <div className="bugreport">
            <div className="bugreport-head">
              🐞 Bug report — {broken.length} attack{broken.length > 1 ? "s" : ""} broke through
            </div>
            {broken.map((r) => (
              <div key={r.index} className="bugcard">
                <div className="bugcard-head">
                  <div className="bugcard-type">🐞 {r.attack.type}</div>
                  <span className="verdict-tag broke">✕ BROKE</span>
                </div>
                <div className="bugcard-prompt">&quot;{r.attack.prompt}&quot;</div>
                <div className="bugcard-why">
                  <b>Why it broke:</b> {r.attack.cause}
                </div>
                <div className="bugcard-fix">
                  <div className="bugcard-fix-label">Suggested fix</div>
                  <div className="bugcard-fix-body">
                    Add to instruction: <code>{r.attack.fixInstruction}</code>
                    <br />
                    Lower temperature to <code>{r.attack.fixTemp}</code>
                  </div>
                </div>
                <div className="bugcard-actions">
                  <button
                    type="button"
                    className="ccard-btn cmp"
                    onClick={() => router.push(`/agent/${agentId}/compare?fix=${r.index}`)}
                  >
                    🧪 Test this fix in Compare →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!running && (
          <p className="mt-8 text-center font-mono text-[11px] text-mute">
            Each prompt goes to <b className="text-dim">{resolveAgentConfig(campaign, agent.config).model}</b> via
            your real shipped agent — held/broke is read from what it actually said back.
          </p>
        )}
      </div>
    </div>
  );
}
