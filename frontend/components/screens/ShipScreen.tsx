"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/lib/store";
import {
  CAMPAIGN_IDS,
  CAMPAIGN_REGISTRY,
  getCampaign,
  resolveAgentConfig,
  type CampaignId,
} from "@/lib/campaigns";
import { confettiBurst, reducedMotion } from "@/lib/effects";
import {
  createAgent,
  chatWithAgent,
  saveProgress,
  LyzrNotConfiguredError,
  type ApiForgedAgent,
} from "@/lib/api";
import { getUserId } from "@/lib/session";
import AgentCardReveal from "@/components/ship/AgentCardReveal";
import KnowledgeUploadForm from "@/components/knowledge/KnowledgeUploadForm";
import type { KnowledgeDoc } from "@/lib/api";

interface ResolvedLine {
  id: number;
  label: string;
  time: string;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function ShipScreen({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const xp = useGameStore((s) => s.xp);
  const timerSeconds = useGameStore((s) => s.timerSeconds);
  const unlockCampaigns = useGameStore((s) => s.unlockCampaigns);
  const unlockAchievements = useGameStore((s) => s.unlockAchievements);
  const slotValues = useGameStore((s) => s.slotValues);
  const forgeAgent = useGameStore((s) => s.forgeAgent);
  const clearActiveBuild = useGameStore((s) => s.clearActiveBuild);

  const campaign = getCampaign(campaignId)!;
  const missions = campaign.missions;
  const runScenarios = campaign.runScenarios;
  const impact = campaign.impact;

  const requiredSlots = missions
    .flatMap((m) => m.code)
    .flatMap((line) => line.parts)
    .map((part) => part.slot?.node)
    .filter((node): node is string => !!node);
  const buildIncomplete = requiredSlots.some((key) => !slotValues[key]);

  useEffect(() => {
    if (buildIncomplete) {
      router.replace(`/build/${campaignId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildIncomplete, campaignId]);

  const [agent, setAgent] = useState<ApiForgedAgent | null>(null);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);

  const [query, setQuery] = useState(runScenarios[0]!.q);
  const [runCount, setRunCount] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [showCursor, setShowCursor] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [running, setRunning] = useState(false);
  const [askedQ, setAskedQ] = useState<string | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  const [queueNum, setQueueNum] = useState(impact.startCount);
  const [queuePct, setQueuePct] = useState(100);
  const [queueState, setQueueState] = useState<"standing" | "clearing" | "clear">("standing");
  const [resolvedFeed, setResolvedFeed] = useState<ResolvedLine[]>([]);
  const resolvedId = useRef(0);

  const totalEstimate = missions.reduce((sum, m) => sum + m.estimateMin, 0);

  const drainQueue = () => {
    setQueueState("clearing");
    const t0 = performance.now();
    const dur = 3200;
    let fed = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 2.2);
      setQueueNum(Math.round(impact.startCount * (1 - eased)));
      setQueuePct(100 - eased * 100);

      if (p > fed / 8 && fed < impact.drainSamples.length) {
        const label = impact.drainSamples[fed]!;
        const time = (Math.random() * 1.5 + 0.3).toFixed(1) + "s";
        const id = resolvedId.current++;
        setResolvedFeed((prev) => [{ id, label, time }, ...prev].slice(0, 5));
        fed++;
      }

      if (p < 1) requestAnimationFrame(tick);
      else {
        setQueueNum(0);
        setQueueState("clear");
        setQueuePct(0);
      }
    };
    requestAnimationFrame(tick);
  };

  const typeOut = (text: string) => {
    const reduce = reducedMotion();
    setTypedAnswer("");
    setShowSource(false);
    setShowCursor(true);
    let i = 0;
    const step = () => {
      if (i <= text.length) {
        setTypedAnswer(text.slice(0, i));
        i += reduce ? text.length : 2;
        setTimeout(step, reduce ? 0 : 16);
      } else {
        setShowCursor(false);
        setShowSource(true);
        setRunning(false);
      }
    };
    step();
  };

  const ensureAgent = async (): Promise<ApiForgedAgent | null> => {
    if (agent) return agent;
    setCreating(true);
    setErrorMsg(null);
    setNotConfigured(false);
    try {
      const { lyzrConfig } = campaign;
      const resolved = resolveAgentConfig(campaign, slotValues);
      const created = await createAgent({
        userId: getUserId(),
        campaignId,
        name: resolved.name,
        instructions: resolved.instructions,
        model: resolved.model,
        temperature: resolved.temperature,
        role: lyzrConfig.role,
        goal: lyzrConfig.goal,
        description: lyzrConfig.description,
        extraFeatures: lyzrConfig.extraFeatures,
        config: slotValues,
        forgeTime: timerSeconds,
        xpEarned: xp,
        estimateMin: totalEstimate,
      });
      setAgent(created);
      forgeAgent(created);
      clearActiveBuild();
      if (created.newAchievements?.length) unlockAchievements(created.newAchievements);

      const newlyUnlocked = Object.values(CAMPAIGN_REGISTRY)
        .filter((c) => c.unlockAfter === campaignId && CAMPAIGN_IDS.includes(c.id as CampaignId))
        .map((c) => c.id);
      if (newlyUnlocked.length) unlockCampaigns(newlyUnlocked);

      const state = useGameStore.getState();
      saveProgress(getUserId(), {
        xp: state.xp,
        streak: state.streak,
        completedMissions: state.completedMissions,
        unlockedCampaigns: state.unlockedCampaigns,
      })
        .then((progress) => {
          if (progress.newAchievements?.length) unlockAchievements(progress.newAchievements);
        })
        .catch(() => {
          /* non-blocking — local state already updated */
        });

      return created;
    } catch (err) {
      if (err instanceof LyzrNotConfiguredError) {
        setNotConfigured(true);
        setErrorMsg(err.message);
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Failed to forge agent.");
      }
      return null;
    } finally {
      setCreating(false);
    }
  };

  const runAgent = async () => {
    if (running || creating) return;
    const q = query.trim();
    if (!q) return;

    const live = await ensureAgent();
    if (!live) return;

    setRunning(true);
    setErrorMsg(null);
    setAskedQ(q);
    const nextCount = runCount + 1;
    setRunCount(nextCount);

    try {
      const { response, newAchievements } = await chatWithAgent(
        live.lyzrAgentId,
        q,
        sessionIdRef.current,
        getUserId()
      );
      if (newAchievements?.length) unlockAchievements(newAchievements);
      typeOut(response);
      if (nextCount === 1) drainQueue();
    } catch (err) {
      setRunning(false);
      if (err instanceof LyzrNotConfiguredError) {
        setNotConfigured(true);
        setErrorMsg(err.message);
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Failed to reach the agent.");
      }
    }
  };

  if (buildIncomplete) return null;

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-16">
      <div className="panel center">
        <div className="badges">
          <div className="medal" data-l="Forged">
            🔨
          </div>
          <div className="medal" data-l="Shipped">
            ⚡
          </div>
          <div className="medal" data-l="Unlocked">
            🔓
          </div>
        </div>

        <h2>
          Ship day. Your agent is <span className="accent">live.</span>
        </h2>
        <p className="lede">{campaign.shipLede}</p>

        {notConfigured && (
          <div className="mx-auto mb-6 max-w-[820px] rounded-xl border border-amber/40 bg-[rgba(var(--color-amber-rgb)/.08)] px-5 py-3 text-left font-mono text-xs text-amber">
            ⚠ Lyzr isn&apos;t configured yet — add a real <code>LYZR_API_KEY</code> to{" "}
            <code>backend/.env</code> to run this live.
          </div>
        )}
        {!notConfigured && errorMsg && (
          <div className="mx-auto mb-6 max-w-[820px] rounded-xl border border-rose/40 bg-[rgba(var(--color-rose-rgb)/.08)] px-5 py-3 text-left font-mono text-xs text-rose">
            ⚠ {errorMsg}
          </div>
        )}

        <div className="ship-grid">
          <div className="run-box">
            <div className="term-bar">
              <span className="dot r" />
              <span className="dot y" />
              <span className="dot g" />
              <span className="term-title">run agent · powered by Lyzr</span>
            </div>
            <div className="run-io">
              {!askedQ ? (
                <span className="label">press Run — send a real ticket through your agent →</span>
              ) : (
                <>
                  <span className="label">Ticket #{4820 + runCount}</span>
                  <br />
                  <span className="q">{askedQ}</span>
                  <br />
                  <br />
                  <span className="label">Agent</span>
                  <br />
                  <span className="a">{typedAnswer}</span>
                  {showCursor && <span className="cursor" />}
                  {showSource && (
                    <>
                      <br />
                      <span className="src">{campaign.chatPage.sourceLine(slotValues)}</span>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2 border-t border-line p-3">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runAgent();
                }}
                placeholder="Ask a test question…"
                className="flex-1 rounded-md border border-line bg-panel-2 px-3 py-2 font-mono text-xs text-text outline-none focus:border-violet"
              />
            </div>
          </div>

          <div className="impact">
            <div className="impact-hd">
              <span>{impact.panelLabel}</span>
              <span>
                {queueState === "standing"
                  ? impact.standingLabel
                  : queueState === "clearing"
                    ? impact.clearingLabel
                    : impact.clearedLabel}
              </span>
            </div>
            <div className="impact-body">
              <div
                className={`queue-num${queueState === "clearing" ? " clearing" : queueState === "clear" ? " clear" : ""}`}
              >
                {queueNum.toLocaleString()}
              </div>
              <div className="queue-lbl">{impact.itemLabel}</div>
              <div className="qbar">
                <i style={{ width: `${queuePct}%` }} />
              </div>
              <div className="resolved-feed">
                {resolvedFeed.map((line) => (
                  <div key={line.id} className="rfeed-line">
                    <span className="rc">✓</span>
                    {impact.resolvedVerb} · {line.label}
                    <span className="rt">{line.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button type="button" className="btn plasma big" onClick={runAgent} disabled={running || creating}>
          {creating
            ? "⏳ Forging on Lyzr…"
            : running
              ? "⏳ Running…"
              : runCount === 0
                ? "▶ Run your agent"
                : "▶ Run next ticket"}
        </button>

        <div className="stat-row">
          <div className="stat-big">
            <span className="n g">{formatTime(timerSeconds)}</span>
            <span className="l">build time</span>
          </div>
          <div className="stat-big">
            <span className="n v">{xp}</span>
            <span className="l">XP earned</span>
          </div>
          <div className="stat-big">
            <span className="n c">
              {missions.length}/{missions.length}
            </span>
            <span className="l">missions</span>
          </div>
        </div>

        <p className="lyzr-note">
          Execution handled by <b>Lyzr</b> · everything else forged by you
        </p>

        {agent && showSource && (
          <AgentCardReveal
            agent={agent}
            campaign={campaign}
            model={agent.config[campaign.lyzrConfig.modelFromSlot ?? "model"] ?? ""}
          />
        )}

        {agent && showSource && (
          <div
            className="mx-auto mt-6 max-w-[560px] rounded-2xl border border-line p-5 text-left"
            style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
          >
            <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[.13em] text-mute">
              Optional
            </div>
            <h3 className="mb-1 font-display text-base font-semibold">
              Give it a knowledge base
            </h3>
            <p className="mb-4 font-mono text-[11.5px] leading-[1.6] text-dim">
              Upload docs or paste text and this agent will search them before answering — skip
              this and it ships fine on instructions alone.
            </p>
            <KnowledgeUploadForm
              agentId={agent.lyzrAgentId}
              onUploaded={(doc) => setKnowledgeDocs((prev) => [doc, ...prev])}
            />
            {knowledgeDocs.length > 0 && (
              <div className="mt-3 font-mono text-[11px] text-mute">
                {knowledgeDocs.length} doc{knowledgeDocs.length === 1 ? "" : "s"} attached — manage
                anytime from the agent&apos;s Doc page.
              </div>
            )}
          </div>
        )}

        {agent && showSource && (
          <div className="ccard-actions" style={{ maxWidth: 560, margin: "22px auto 0", gridTemplateColumns: "repeat(2,1fr)" }}>
            <button
              type="button"
              className="ccard-btn view"
              onClick={() => {
                confettiBurst(60);
                router.push(`/agent/${agent.id}/doc`);
              }}
            >
              📄 View what you learned
            </button>
            <button
              type="button"
              className="ccard-btn talk"
              onClick={() => {
                confettiBurst(60);
                router.push(`/agent/${agent.id}/chat`);
              }}
            >
              💬 Talk to Agent
            </button>
            <button
              type="button"
              className="ccard-btn arena"
              onClick={() => router.push(`/agent/${agent.id}/arena`)}
            >
              ⚔️ Red Team Arena
            </button>
            <button
              type="button"
              className="ccard-btn cmp"
              onClick={() => router.push(`/agent/${agent.id}/compare`)}
            >
              🧬 Multiverse Compare
            </button>
          </div>
        )}

        {agent && showSource && (
          <div style={{ maxWidth: 560, margin: "10px auto 0" }}>
            <button
              type="button"
              className="btn primary ready"
              style={{ width: "100%" }}
              onClick={() => router.push(`/agent/${agent.id}/certificate`)}
            >
              🏅 Generate Forge Certificate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
