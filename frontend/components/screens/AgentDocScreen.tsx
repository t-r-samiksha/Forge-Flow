"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAgent, reforgeAgent, LyzrNotConfiguredError, type ApiForgedAgent } from "@/lib/api";
import { getUserId } from "@/lib/session";
import { getCampaign, resolveAgentConfig } from "@/lib/campaigns";
import { estimateCost, knownModelKeys } from "@/lib/estimator";
import { showToast } from "@/lib/effects";
import { useGameStore } from "@/lib/store";
import InspectorSection from "@/components/hub/InspectorSection";
import TestConsole from "@/components/hub/TestConsole";
import CodeStructureSection from "@/components/hub/CodeStructureSection";
import ActionsPanel from "@/components/hub/ActionsPanel";
import KnowledgePanel from "@/components/knowledge/KnowledgePanel";

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export default function AgentDocScreen({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [agent, setAgentState] = useState<ApiForgedAgent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeSection, setActiveSection] = useState("l-overview");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const articleRef = useRef<HTMLDivElement>(null);
  const testSessionIdRef = useRef(crypto.randomUUID());

  const inspectorMode = useGameStore((s) => s.inspectorMode);
  const inspectorDirtySlots = useGameStore((s) => s.inspectorDirtySlots);
  const toggleInspectorMode = useGameStore((s) => s.toggleInspectorMode);
  const setInspectorSlot = useGameStore((s) => s.setInspectorSlot);
  const resetInspector = useGameStore((s) => s.resetInspector);
  const dirty = Object.keys(inspectorDirtySlots).length > 0;

  useEffect(() => {
    getAgent(getUserId(), agentId)
      .then(setAgentState)
      .catch(() => setNotFound(true));
  }, [agentId]);

  useEffect(() => {
    if (notFound) router.replace("/campaigns");
  }, [notFound, router]);

  const campaign = agent ? getCampaign(agent.campaignId) : undefined;
  const missions = campaign?.missions ?? [];

  const toc = useMemo(
    () => [
      { id: "l-overview", label: "Overview" },
      ...missions.map((m, i) => ({ id: `l-m-${i}`, label: `${i + 1}. ${m.title}` })),
      { id: "l-full", label: "Full assembled code" },
      { id: "l-structure", label: "Code structure (raw)" },
      { id: "l-test", label: "Test console" },
      { id: "l-knowledge", label: "Knowledge" },
      { id: "l-cost", label: "Cost & latency" },
      { id: "l-glossary", label: "Glossary" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [missions.map((m) => m.title).join("|")]
  );

  useEffect(() => {
    const onScroll = () => {
      const sections = toc.map((t) => document.getElementById(t.id)).filter(
        (el): el is HTMLElement => !!el
      );
      let current = sections[0];
      for (const s of sections) {
        if (s.getBoundingClientRect().top - 90 <= 0) current = s;
      }
      if (current) setActiveSection(current.id);
    };
    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [agent, toc]);

  if (notFound) return null;

  if (!agent || !campaign || missions.length === 0) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-24 text-center">
        <p className="text-sm text-dim">Loading agent…</p>
      </div>
    );
  }

  // Edit mode overlays unsaved pillar edits on top of the shipped config,
  // so the code snippets and cost table stay consistent with what
  // InspectorSection shows instead of silently lagging behind it.
  const cfg = inspectorMode === "edit" ? { ...agent.config, ...inspectorDirtySlots } : agent.config;
  const { docCopy, docCode } = campaign;

  const handleSave = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setErrorMsg(null);
    setNotConfigured(false);
    try {
      const merged = { ...agent.config, ...inspectorDirtySlots };
      const resolved = resolveAgentConfig(campaign, merged);
      const estimateMin = campaign.missions.reduce((sum, m) => sum + m.estimateMin, 0);
      await reforgeAgent(getUserId(), agentId, {
        updatedSlots: inspectorDirtySlots,
        instructions: resolved.instructions,
        model: resolved.model,
        temperature: resolved.temperature,
        estimateMin,
      });
      const refreshed = await getAgent(getUserId(), agentId);
      setAgentState(refreshed);
      resetInspector();
      showToast("✓", `Re-forged as v${refreshed.version}`);
    } catch (err) {
      if (err instanceof LyzrNotConfiguredError) {
        setNotConfigured(true);
        setErrorMsg(err.message);
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Failed to re-forge on Lyzr.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-16">
      <div className="subnav">
        <button type="button" className="back-link" onClick={() => router.push("/campaigns")}>
          ← back to ForgeFlow
        </button>
        <div style={{ display: "flex", gap: 10, flex: "none" }}>
          <button
            type="button"
            className="ccard-btn view"
            style={{ flex: "none" }}
            onClick={toggleInspectorMode}
          >
            {inspectorMode === "study" ? "✏️ Switch to Edit mode" : "📖 Switch to Study mode"}
          </button>
          <button
            type="button"
            className="ccard-btn talk"
            style={{ flex: "none" }}
            onClick={() => router.push(`/agent/${agentId}/chat`)}
          >
            💬 Talk to this agent
          </button>
        </div>
      </div>

      {notConfigured && (
        <div className="mb-5 rounded-xl border border-amber/40 bg-[rgba(var(--color-amber-rgb)/.08)] px-5 py-3 font-mono text-xs text-amber">
          ⚠ Lyzr isn&apos;t configured — add a real <code>LYZR_API_KEY</code> to re-forge live.
        </div>
      )}
      {!notConfigured && errorMsg && (
        <div className="mb-5 rounded-xl border border-rose/40 bg-[rgba(var(--color-rose-rgb)/.08)] px-5 py-3 font-mono text-xs text-rose">
          ⚠ {errorMsg}
        </div>
      )}

      {inspectorMode === "edit" && (
        <div className="mb-6">
          <ActionsPanel agent={agent} dirty={dirty} saving={saving} onSave={handleSave} onReset={resetInspector} />
        </div>
      )}

      <div className="learn-hero">
        <div className="learn-kicker">{docCopy.kicker}</div>
        <h1>
          Everything you <span className="accent">forged</span>, in one place.
        </h1>
        <p className="lede" style={{ marginBottom: 0 }}>
          {docCopy.heroLede}
        </p>
        <div className="learn-meta">
          <span>
            ⏱ build time <b>{formatTime(agent.forgeTime)}</b>
          </span>
          <span>
            ⚡ XP earned <b>{agent.xpEarned}</b>
          </span>
          <span>
            ✓ missions <b>{missions.length} / {missions.length}</b>
          </span>
          <span>
            🧠 stack <b>{docCopy.stackLabel}</b>
          </span>
        </div>
      </div>

      <div className="learn-wrap">
        <nav className="learn-toc">
          <div className="learn-toc-label">Contents</div>
          {toc.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              className={activeSection === t.id ? "active" : undefined}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {t.label}
            </a>
          ))}
        </nav>

        <article ref={articleRef} className="learn-article">
          <section id="l-overview">
            <h2>
              <span className="sn">·</span> Overview
            </h2>
            <p>{docCopy.overviewParagraphs[0]}</p>
            <p>{docCopy.overviewParagraphs[1]}</p>
          </section>

          {missions.map((mission, i) => {
            const winNote = docCopy.missionWinNotes[i];
            return (
              <section key={mission.key} id={`l-m-${i}`}>
                <h2>
                  <span className="sn">{String(i + 1).padStart(2, "0")}</span> {mission.title}
                </h2>
                <p>{mission.sitrepHtml.replace(/<\/?b>/g, "")}</p>
                <h3>The trade-off you weighed</h3>
                {/* eslint-disable-next-line react/no-danger */}
                <div dangerouslySetInnerHTML={{ __html: mission.tabs[0] }} />
                <div className="callout pitfall">
                  <span className="ci">⚠</span>
                  {/* eslint-disable-next-line react/no-danger */}
                  <div dangerouslySetInnerHTML={{ __html: mission.tabs[1] }} />
                </div>
                <div className="callout note">
                  <span className="ci">ℹ</span>
                  {/* eslint-disable-next-line react/no-danger */}
                  <div dangerouslySetInnerHTML={{ __html: mission.tabs[2] }} />
                </div>
                <h3>Your code</h3>
                <div style={{ position: "relative" }}>
                  <span className="snippet-tag" style={{ position: "relative", left: 12, top: 12, marginBottom: -4, zIndex: 1 }}>
                    your build
                  </span>
                  <div
                    className="learn-snippet"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: docCode.perMission[i]?.(cfg) ?? "" }}
                  />
                </div>
                {winNote && (
                  <div className="callout win">
                    <span className="ci">✓</span>
                    <div>
                      <b>Why it works:</b> {winNote}
                    </div>
                  </div>
                )}
                {campaign.inspectorSections
                  .filter((s) => s.missionIndex === i)
                  .map((s) => (
                    <div key={s.id} style={{ marginTop: 20 }}>
                      <InspectorSection
                        section={s}
                        mode={inspectorMode}
                        originalConfig={agent.originalConfig}
                        liveConfig={cfg}
                        onSlotChange={setInspectorSlot}
                      />
                    </div>
                  ))}
              </section>
            );
          })}

          <div className="learn-divider" />

          <section id="l-full">
            <h2>
              <span className="sn">⚡</span> Full assembled agent
            </h2>
            <p>
              Everything wired together — this is what runs on Lyzr when you hit{" "}
              <b>Run your agent</b>.
            </p>
            <div style={{ position: "relative" }}>
              <span className="snippet-tag" style={{ position: "relative", left: 12, top: 12, marginBottom: -4, zIndex: 1 }}>
                {missions[0]!.file}
              </span>
              <div
                className="learn-snippet"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: docCode.full(cfg) }}
              />
            </div>
          </section>

          <section id="l-structure">
            <h2>
              <span className="sn">{"{}"}</span> Code structure (raw)
            </h2>
            <p>
              The exact JSON payload your agent was created from on Lyzr — no formatting, no
              paraphrasing, straight from the API response.
            </p>
            <CodeStructureSection payload={agent.lyzrPayload} />
          </section>

          <section id="l-test">
            <h2>
              <span className="sn">▶</span> Test console
            </h2>
            <p>
              A real call to the shipped agent, right here — same as Talk to Agent, scoped to one
              quick check.
            </p>
            <TestConsole agentId={agent.lyzrAgentId} sessionId={testSessionIdRef.current} />
          </section>

          <section id="l-knowledge">
            <h2>
              <span className="sn">📚</span> Knowledge
            </h2>
            <p>
              Optional grounding — any docs ingested here get chunked, embedded, and searched
              against before each chat reply, and cited from instead of the model guessing.
            </p>
            <KnowledgePanel agentId={agent.lyzrAgentId} />
          </section>

          <section id="l-cost">
            <h2>
              <span className="sn">$</span> Cost &amp; latency
            </h2>
            <p>
              The pillar most tutorials skip. Every model choice is a cost/speed/quality trade —
              here&apos;s what your pick actually costs per query, next to the alternative.
            </p>
            <table className="cost-table">
              <thead>
                <tr>
                  <th>model</th>
                  <th>tokens/query</th>
                  <th>est. cost/query</th>
                  <th>est. latency</th>
                </tr>
              </thead>
              <tbody>
                {knownModelKeys().map((key) => {
                  const est = estimateCost(key, cfg.ret ?? "5");
                  const mine = key === resolveAgentConfig(campaign, cfg).model;
                  const barPct = Math.min(100, (est.cost / 0.0015) * 100);
                  return (
                    <tr key={key} className={mine ? "mine" : undefined}>
                      <td>
                        <b>{key}</b>
                        {mine && <span className="snippet-tag" style={{ marginLeft: 8 }}>yours</span>}
                      </td>
                      <td>{est.totalTokens} tok</td>
                      <td>
                        <span className="cost-bar-wrap">
                          <span className="cost-bar" style={{ width: `${barPct}%` }} />
                        </span>
                        ${est.cost.toFixed(5)}
                      </td>
                      <td>~{est.latencyMs}ms</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="callout note">
              <span className="ci">ℹ</span>
              <div>
                Estimates assume {cfg.ret ?? "5"} retrieved chunks at ~180 tokens each, plus a
                ~120-token instruction and query. Real costs vary by provider pricing and response
                length.
              </div>
            </div>
          </section>

          <section id="l-glossary">
            <h2>
              <span className="sn">⌗</span> Glossary
            </h2>
            <div className="glossary">
              {docCopy.glossary.map((g) => (
                <div className="gterm" key={g.term}>
                  <b>{g.term}</b>
                  <span>{g.def}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="learn-cta">
            <h3>Put it under pressure</h3>
            <p>Fork this config and compare it head-to-head, or send in the red team and see if it holds.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="ccard-btn cmp"
                style={{ maxWidth: 200 }}
                onClick={() => router.push(`/agent/${agentId}/compare`)}
              >
                🧬 Compare
              </button>
              <button
                type="button"
                className="ccard-btn arena"
                style={{ maxWidth: 200 }}
                onClick={() => router.push(`/agent/${agentId}/arena`)}
              >
                ⚔️ Red Team
              </button>
            </div>
          </div>

          <div className="learn-cta">
            <h3>Ready to hear it talk?</h3>
            <p>Chat with the agent you just configured — same config, same decisions.</p>
            <button
              type="button"
              className="ccard-btn talk"
              style={{ maxWidth: 220, margin: "0 auto" }}
              onClick={() => router.push(`/agent/${agentId}/chat`)}
            >
              💬 Talk to Agent
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
