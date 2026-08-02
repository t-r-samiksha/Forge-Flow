"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  chatWithAgent,
  getAgent,
  previewAgent,
  reforgeAgent,
  LyzrNotConfiguredError,
  type ApiForgedAgent,
} from "@/lib/api";
import { getUserId } from "@/lib/session";
import { getCampaign, resolveAgentConfig } from "@/lib/campaigns";
import { freeformShippedConfig } from "@/lib/freeformAgentView";
import { estimateCost, knownModelKeys } from "@/lib/estimator";
import { buildShareUrl } from "@/lib/share";
import { confettiBurst, showToast } from "@/lib/effects";
import { useGameStore } from "@/lib/store";
import { classifyHeld } from "@/lib/arenaHeuristics";

export default function CompareScreen({ agentId }: { agentId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const addXp = useGameStore((s) => s.addXp);
  const unlockAchievements = useGameStore((s) => s.unlockAchievements);

  const [agent, setAgentState] = useState<ApiForgedAgent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [bModel, setBModel] = useState("gemini-2.5-flash");
  const [bTemp, setBTemp] = useState("0.3");
  const [bInstr, setBInstr] = useState("");

  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [aResponse, setAResponse] = useState<string | null>(null);
  const [bResponse, setBResponse] = useState<string | null>(null);
  const [bError, setBError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const sessionIdRef = useRef(crypto.randomUUID());
  const aInstrRef = useRef<HTMLDivElement>(null);
  const bInstrRef = useRef<HTMLTextAreaElement>(null);

  // Real Red Team Arena results are dynamically generated per run (§7,
  // Redcap), not a fixed indexable array — so "Test this fix in Compare"
  // hands off the actual prompt/category/suggestion inline via query
  // params instead of an index into a static list.
  const fixCategory = searchParams.get("fixCategory");
  const fixPromptParam = searchParams.get("fixPrompt");
  const fixSuggestionParam = searchParams.get("fixSuggestion");

  useEffect(() => {
    getAgent(getUserId(), agentId)
      .then(setAgentState)
      .catch(() => setNotFound(true));
  }, [agentId]);

  useEffect(() => {
    if (notFound) router.replace("/campaigns");
  }, [notFound, router]);

  const campaign = agent ? getCampaign(agent.campaignId) : undefined;
  const fixAttack = useMemo(
    () =>
      fixPromptParam !== null
        ? { category: fixCategory ?? "security", prompt: fixPromptParam, suggestion: fixSuggestionParam ?? "" }
        : null,
    [fixCategory, fixPromptParam, fixSuggestionParam]
  );

  useEffect(() => {
    if (!agent || initialized) return;
    const a = campaign ? resolveAgentConfig(campaign, agent.config) : freeformShippedConfig(agent);
    if (fixAttack) {
      setQuery(fixAttack.prompt);
      setBModel(a.model);
      setBTemp("0.15");
      setBInstr(`${a.instructions} ${fixAttack.suggestion}`.trim());
    } else {
      setQuery(campaign?.runScenarios[0]?.q ?? campaign?.chatScenarios[0]?.q ?? "");
      setBModel(a.model === "gemini-2.5-pro" ? "gemini-2.5-flash" : "gemini-2.5-pro");
      setBTemp(String(a.temperature));
      setBInstr(a.instructions);
    }
    setInitialized(true);
  }, [agent, campaign, fixAttack, initialized]);

  // Version A's instruction is a plain div that already grows to fit its
  // text; Version B is an editable textarea, which needs the same
  // auto-grow behavior applied manually. Both are driven to the taller
  // of the two so a long instruction on either side doesn't leave the
  // shorter column's response/stats rows out of alignment with its
  // counterpart.
  useLayoutEffect(() => {
    const aEl = aInstrRef.current;
    const bEl = bInstrRef.current;
    if (!aEl || !bEl) return;
    aEl.style.height = "auto";
    bEl.style.height = "auto";
    // +2px: textareas can report a scrollHeight a pixel or two taller
    // than the height that was just measured at "auto" (a browser
    // rounding quirk in how border-box padding gets factored in),
    // which is enough for an unwanted 2px internal scrollbar to appear
    // even though the text visibly fits. The buffer absorbs that.
    const target = Math.max(aEl.scrollHeight, bEl.scrollHeight) + 2;
    aEl.style.height = `${target}px`;
    bEl.style.height = `${target}px`;
  }, [agent, campaign, bInstr]);

  if (notFound) return null;
  if (!agent) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-24 text-center">
        <p className="text-sm text-dim">Loading agent…</p>
      </div>
    );
  }

  const freeformCfg = campaign ? null : freeformShippedConfig(agent);
  const a = campaign ? resolveAgentConfig(campaign, agent.config) : freeformCfg!;
  const hasTopK = "ret" in agent.config;
  const aTopK = agent.config.ret ?? "5";
  const securityMode = !!fixAttack && query.trim() === fixAttack.prompt;

  const estA = estimateCost(a.model, aTopK);
  const estB = estimateCost(bModel, hasTopK ? aTopK : "5");
  // Only meaningful once both real responses are in — held/broke read
  // from what each agent actually said, via the same heuristic Arena uses.
  const chanceA = hasRun && securityMode && aResponse ? (classifyHeld(aResponse) ? 100 : 0) : null;
  const chanceB = hasRun && securityMode && bResponse ? (classifyHeld(bResponse) ? 100 : 0) : null;

  const runCompare = async () => {
    const q = query.trim();
    if (!q || running) return;
    setRunning(true);
    setErrorMsg(null);
    setBError(null);
    setAResponse("thinking…");
    setBResponse("thinking…");

    const runA = chatWithAgent(agent.lyzrAgentId, q, sessionIdRef.current, getUserId())
      .then(({ response, newAchievements }) => {
        if (newAchievements?.length) unlockAchievements(newAchievements);
        setAResponse(response);
      })
      .catch((err) => {
        if (err instanceof LyzrNotConfiguredError) {
          setNotConfigured(true);
        } else {
          setErrorMsg(err instanceof Error ? err.message : "Failed to reach Version A.");
        }
        setAResponse(null);
      });

    const runB = previewAgent({
      name: `${agent.name} (preview)`,
      instructions: bInstr,
      model: bModel,
      temperature: parseFloat(bTemp) || 0,
      message: q,
      role: campaign ? campaign.lyzrConfig.role : freeformCfg!.role,
      goal: campaign ? campaign.lyzrConfig.goal : freeformCfg!.goal,
      description: campaign ? campaign.lyzrConfig.description : "Agent built in ForgeFlow",
    })
      .then(({ response }) => setBResponse(response))
      .catch((err) => {
        if (err instanceof LyzrNotConfiguredError) {
          setNotConfigured(true);
        } else {
          setBError(err instanceof Error ? err.message : "Failed to reach Version B.");
        }
        setBResponse(null);
      });

    await Promise.all([runA, runB]);
    setHasRun(true);
    setRunning(false);
  };

  const finalize = async () => {
    if (finalizing) return;
    setFinalizing(true);
    setErrorMsg(null);
    try {
      // Campaign agents store their live values inside `config` under
      // campaign-defined slot keys, so a re-forge has to write them back
      // there. Freeform agents never used that slot system (their config is
      // always {}) — instructions/model/temperature are the real re-forge
      // inputs on their own, so there's nothing to merge into `config`.
      let updatedSlots: Record<string, string> = {};
      let estimateMin = 15; // matches the estimate freeform's own ship() uses
      if (campaign) {
        const instrKey = campaign.lyzrConfig.instructionsFromSlot ?? "instr";
        const modelKey = campaign.lyzrConfig.modelFromSlot ?? "model";
        const tempKey = campaign.lyzrConfig.tempFromSlot ?? "temp";
        updatedSlots = { [instrKey]: bInstr, [modelKey]: bModel, [tempKey]: bTemp };
        estimateMin = campaign.missions.reduce((sum, m) => sum + m.estimateMin, 0);
      }
      const result = await reforgeAgent(getUserId(), agentId, {
        updatedSlots,
        instructions: bInstr,
        model: bModel,
        temperature: parseFloat(bTemp) || 0,
        estimateMin,
      });
      addXp(10);
      showToast("+10 XP", `Configuration updated — re-forged as v${result.version}`);
      confettiBurst(40);
      router.push(`/agent/${agentId}/chat`);
    } catch (err) {
      if (err instanceof LyzrNotConfiguredError) {
        setNotConfigured(true);
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Failed to re-forge on Lyzr.");
      }
    } finally {
      setFinalizing(false);
    }
  };

  const doShare = () => {
    setShareUrl(
      buildShareUrl("compare", {
        query,
        aModel: a.model,
        aTemp: a.temperature,
        aInstr: a.instructions,
        aResponse,
        aCost: estA.cost,
        aLatency: estA.latencyMs,
        bModel,
        bTemp,
        bInstr,
        bResponse,
        bCost: estB.cost,
        bLatency: estB.latencyMs,
        securityMode,
        chanceA,
        chanceB,
        attackType: fixAttack?.category ?? null,
      })
    );
  };

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-16">
      <div className="subnav">
        <button type="button" className="back-link" onClick={() => router.push("/campaigns")}>
          ← back to ForgeFlow
        </button>
      </div>
      <div className="cmp-shell">
        <div className="learn-hero" style={{ marginBottom: 22 }}>
          <div className="learn-kicker">{campaign?.title ?? "Freeform Build"} · fork test</div>
          <h1>
            Same question. <span className="accent">Different agent.</span>
          </h1>
          <p className="lede" style={{ marginBottom: 0 }}>
            Version A is exactly what you shipped — this runs for real. Fork it into Version B,
            change a variable, and preview the cost/latency and (for a security fix) the
            estimated hold-chance before you commit anything.
          </p>
        </div>

        {notConfigured && (
          <div className="mb-5 rounded-xl border border-amber/40 bg-[rgba(var(--color-amber-rgb)/.08)] px-5 py-3 font-mono text-xs text-amber">
            ⚠ Lyzr isn&apos;t configured — add a real <code>LYZR_API_KEY</code> to run this live.
          </div>
        )}
        {errorMsg && (
          <div className="mb-5 rounded-xl border border-rose/40 bg-[rgba(var(--color-rose-rgb)/.08)] px-5 py-3 font-mono text-xs text-rose">
            ⚠ {errorMsg}
          </div>
        )}

        {securityMode && (
          <div className="cmp-context">
            🐞 Testing a fix for{" "}
            <b>{fixAttack?.category ? fixAttack.category.replace(/_/g, " ") : ""}</b> — Version A is
            the config that broke in
            Red Team Arena. Version B has the suggested fix pre-filled.
          </div>
        )}

        <div className="cmp-query-row">
          <input
            type="text"
            className="chat-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask both versions the same question…"
          />
          <button type="button" className="chat-send" onClick={runCompare} disabled={running || !query.trim()}>
            {running ? "Running…" : "Run both →"}
          </button>
        </div>

        <div className="cmp-cols">
          <div className="cmp-vs">VS</div>
          <div className="cmp-col a">
            <div className="cmp-col-head">
              <b>Version A</b>
              <span className="cmp-tag a">shipped</span>
            </div>
            <div className="cmp-field">
              <label>model</label>
              <div className="locked-val">{a.model}</div>
            </div>
            <div className="cmp-field">
              <label>temperature</label>
              <div className="locked-val">{a.temperature}</div>
            </div>
            <div className="cmp-field">
              <label>instruction</label>
              <div ref={aInstrRef} className="locked-val wrap">{a.instructions}</div>
            </div>
            <div className="cmp-response">{aResponse ?? "Run a query to see Version A respond."}</div>
            <div className="cmp-stats">
              <span className="cmp-stat">
                tok <b>{estA.totalTokens}</b>
              </span>
              <span className="cmp-stat">
                cost <b>${estA.cost.toFixed(5)}</b>
              </span>
              <span className="cmp-stat">
                latency <b>{estA.latencyMs}ms</b>
              </span>
            </div>
            {securityMode && chanceA !== null && (
              <VerdictBar label="held vs this attack" pct={chanceA} />
            )}
          </div>

          <div className="cmp-col b">
            <div className="cmp-col-head">
              <b>Version B</b>
              <span className="cmp-tag b">forked · edit me</span>
            </div>
            <div className="cmp-field">
              <label>model</label>
              <select value={bModel} onChange={(e) => setBModel(e.target.value)}>
                {knownModelKeys().map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div className="cmp-field">
              <label>temperature</label>
              <input type="text" value={bTemp} onChange={(e) => setBTemp(e.target.value)} />
            </div>
            <div className="cmp-field">
              <label>instruction</label>
              <textarea
                ref={bInstrRef}
                className="autosize"
                value={bInstr}
                onChange={(e) => setBInstr(e.target.value)}
              />
            </div>
            <div className="cmp-response">
              {bResponse ?? (running ? "thinking…" : "Run a query to see Version B respond.")}
            </div>
            {bError && (
              <div className="mb-3 rounded-xl border border-rose/40 bg-[rgba(var(--color-rose-rgb)/.08)] px-4 py-2 font-mono text-xs text-rose">
                ⚠ {bError}
              </div>
            )}
            <div className="cmp-stats">
              <span className="cmp-stat">
                tok <b>{estB.totalTokens}</b>
              </span>
              <span className="cmp-stat">
                cost <b>${estB.cost.toFixed(5)}</b>
              </span>
              <span className="cmp-stat">
                latency <b>{estB.latencyMs}ms</b>
              </span>
            </div>
            {securityMode && chanceB !== null && (
              <VerdictBar label="held vs this attack" pct={chanceB} />
            )}
          </div>
        </div>

        {hasRun && (
          <div className="cmp-delta show">
            {securityMode && chanceA !== null && chanceB !== null ? (
              <>
                <b>
                  {chanceB - chanceA >= 15
                    ? "✓ This fix looks solid."
                    : chanceB - chanceA > 0
                      ? "⚠️ Some improvement, but still risky."
                      : "✕ No real improvement — try a stronger fix."}
                </b>{" "}
                Against this real prompt, Version A {chanceA >= 70 ? "held" : "broke"} and Version B{" "}
                {chanceB >= 70 ? "held" : "broke"} — both responses above are genuine, not
                simulated. Finalize to make Version B the real live agent.
              </>
            ) : (
              <>
                <b>Same question, different cost.</b> Version B ({bModel}) is estimated at{" "}
                {estB.cost > estA.cost
                  ? `${(estB.cost / estA.cost).toFixed(1)}x more expensive`
                  : estB.cost < estA.cost
                    ? `${(estA.cost / estB.cost).toFixed(1)}x cheaper`
                    : "the same cost"}{" "}
                and{" "}
                {estB.latencyMs > estA.latencyMs
                  ? `${estB.latencyMs - estA.latencyMs}ms slower`
                  : estB.latencyMs < estA.latencyMs
                    ? `${estA.latencyMs - estB.latencyMs}ms faster`
                    : "the same latency"}{" "}
                than Version A per query. That gap compounds fast at production volume.
              </>
            )}
          </div>
        )}

        {hasRun && (
          <div className="cmp-finalize" style={{ display: "flex" }}>
            <button type="button" className="ccard-btn talk" onClick={finalize} disabled={finalizing}>
              {finalizing ? "⏳ Re-forging on Lyzr…" : "✓ Finalize this configuration"}
            </button>
            <button type="button" className="ccard-btn share" onClick={doShare}>
              🔗 Share this comparison
            </button>
          </div>
        )}

        {shareUrl && (
          <div className="share-box show">
            <div className="share-box-row">
              <input readOnly value={shareUrl} className="share-link-input" />
              <button
                type="button"
                className="ccard-btn share"
                style={{ flex: "none", padding: "9px 12px" }}
                onClick={() => navigator.clipboard?.writeText(shareUrl)}
              >
                Copy
              </button>
              <button
                type="button"
                className="ccard-btn li"
                style={{ flex: "none", padding: "9px 12px" }}
                onClick={() =>
                  window.open(
                    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
                    "_blank",
                    "noopener"
                  )
                }
              >
                in Share
              </button>
            </div>
            <div className="share-box-note">
              Anyone opening this link sees a static, read-only page of this exact comparison — no
              login required.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function verdictColor(pct: number): string {
  if (pct >= 70) return "var(--color-spring)";
  if (pct >= 40) return "var(--color-amber)";
  return "var(--color-rose)";
}

function VerdictBar({ pct, label }: { pct: number; label: string }) {
  const color = verdictColor(pct);
  return (
    <>
      <div className="verdict-label">{label}</div>
      <div className="verdict-row">
        <div className="verdict-bar-wrap">
          <div className="verdict-bar" style={{ width: `${pct}%`, background: color }} />
        </div>
        <div className="verdict-pct" style={{ color }}>
          {pct}%
        </div>
      </div>
    </>
  );
}
