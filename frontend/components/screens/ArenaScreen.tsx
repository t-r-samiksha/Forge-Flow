"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  runRedTeam,
  getAgent,
  LyzrNotConfiguredError,
  type ApiForgedAgent,
  type RedTeamResult,
} from "@/lib/api";
import { getUserId } from "@/lib/session";
import { getCampaign, resolveAgentConfig } from "@/lib/campaigns";
import { freeformShippedConfig } from "@/lib/freeformAgentView";
import { confettiBurst, showToast } from "@/lib/effects";
import { useGameStore } from "@/lib/store";

interface AttackResult extends RedTeamResult {
  index: number;
}

function prettyCategory(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ArenaScreen({ agentId }: { agentId: string }) {
  const router = useRouter();
  const addXp = useGameStore((s) => s.addXp);

  const [agent, setAgentState] = useState<ApiForgedAgent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<AttackResult[]>([]);
  const [notConfigured, setNotConfigured] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
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
  }, [results]);

  const campaign = agent ? getCampaign(agent.campaignId) : undefined;
  const heldCount = results.filter((r) => r.verdict === "held").length;
  const finished = done && results.length > 0 && !runError;
  const win = finished && heldCount >= Math.ceil(results.length * 0.75);

  useEffect(() => {
    if (!finished) return;
    addXp(heldCount * 5);
    showToast(`+${heldCount * 5} XP`, `Red team run complete — ${heldCount}/${results.length} held`);
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

  const start = async () => {
    if (running) return;
    setRunning(true);
    setDone(false);
    setResults([]);
    setNotConfigured(false);
    setRunError(null);

    try {
      const { results: real } = await runRedTeam(getUserId(), agentId);
      setResults(real.map((r, i) => ({ ...r, index: i })));
    } catch (err) {
      if (err instanceof LyzrNotConfiguredError) {
        setNotConfigured(true);
      } else {
        setRunError(err instanceof Error ? err.message : "Red team run failed.");
      }
    } finally {
      setRunning(false);
      setDone(true);
    }
  };

  /** Reset to the start screen — mirrors the reference's renderArena(),
   * which only resets state; the attacks re-run when the user clicks
   * "Launch attack sequence" again, not immediately. */
  const reset = () => {
    setRunning(false);
    setDone(false);
    setResults([]);
    setNotConfigured(false);
    setRunError(null);
  };

  const broken = results.filter((r) => r.verdict === "broke");

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
              5 real adversarial prompts, generated fresh by Redcap for this agent&apos;s actual role
              and instructions, sent to the actual agent you shipped, and judged for real. Held or
              broke — the log doesn&apos;t lie.
            </p>
          </div>
          <div className="arena-score">
            {heldCount}
            <span>held / {results.length || 5}</span>
          </div>
        </div>

        {notConfigured && (
          <div className="mb-5 rounded-xl border border-amber/40 bg-[rgba(var(--color-amber-rgb)/.08)] px-5 py-3 font-mono text-xs text-amber">
            ⚠ Lyzr isn&apos;t configured — add a real <code>LYZR_API_KEY</code> (and{" "}
            <code>LYZR_REDCAP_AGENT_ID</code>) to run live attacks.
          </div>
        )}
        {runError && (
          <div className="mb-5 rounded-xl border border-rose/40 bg-[rgba(var(--color-rose-rgb)/.08)] px-5 py-3 font-mono text-xs text-rose">
            ⚠ {runError}
          </div>
        )}

        <div className="arena-progress">
          {(results.length > 0
            ? results
            : Array.from<AttackResult | undefined>({ length: running ? 5 : 0 })
          ).map((r, i) => {
            const cls = r ? (r.verdict === "held" ? " held" : " broke") : " active";
            return <i key={i} className={cls.trim()} />;
          })}
        </div>

        <div ref={logRef} className="arena-log" style={{ maxHeight: 440, overflowY: "auto" }}>
          {results.map((r) => (
            <div key={r.index} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="chat-bubble attacker">
                <div className="attacker-tag">⚠ {prettyCategory(r.category)}</div>
                {r.prompt}
              </div>
              <div className="chat-bubble agent">
                <div>{r.response}</div>
                <div>
                  <span className={`verdict-tag ${r.verdict === "held" ? "held" : "broke"}`}>
                    {r.verdict === "held" ? "✓ HELD" : "✕ BROKE"}
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

        {running && (
          <div className="arena-start">
            <p className="font-mono text-[11px] text-mute">
              ⏳ Redcap is attacking and judging — 5 tailored prompts, each sent to the real agent and
              judged for real. Usually well under a minute.
            </p>
          </div>
        )}

        {finished && (
          <div className={`arena-summary ${win ? "win" : "loss"}`}>
            <div className="arena-summary-score" style={{ color: win ? "var(--spring, var(--color-spring))" : "var(--rose, var(--color-rose))" }}>
              {heldCount}/{results.length}
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
                  <div className="bugcard-type">🐞 {prettyCategory(r.category)}</div>
                  <span className="verdict-tag broke">✕ BROKE</span>
                </div>
                <div className="bugcard-prompt">&quot;{r.prompt}&quot;</div>
                <div className="bugcard-why">
                  <b>Why it broke:</b> {r.reason || "Redcap did not give a specific reason."}
                </div>
                <div className="bugcard-fix">
                  <div className="bugcard-fix-label">Suggested fix</div>
                  <div className="bugcard-fix-body">
                    {r.suggestion || "No specific fix suggested — review this response manually."}
                  </div>
                </div>
                <div className="bugcard-actions">
                  <button
                    type="button"
                    className="ccard-btn cmp"
                    onClick={() =>
                      router.push(
                        `/agent/${agentId}/compare?fixCategory=${encodeURIComponent(r.category)}` +
                          `&fixPrompt=${encodeURIComponent(r.prompt)}` +
                          `&fixSuggestion=${encodeURIComponent(r.suggestion)}`
                      )
                    }
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
            Each prompt goes to{" "}
            <b className="text-dim">
              {campaign ? resolveAgentConfig(campaign, agent.config).model : freeformShippedConfig(agent).model}
            </b>{" "}
            via your real shipped agent — held/broke is Redcap&apos;s real judgment on what it
            actually said back.
          </p>
        )}
      </div>
    </div>
  );
}
