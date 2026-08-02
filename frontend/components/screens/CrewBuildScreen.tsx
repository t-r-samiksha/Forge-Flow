"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FreeformBuildScreen from "./FreeformBuildScreen";
import MissionIntro from "@/components/build/MissionIntro";
import MissionRail from "@/components/build/MissionRail";
import { createCrew, getProgress, saveProgress, type ApiForgedAgent } from "@/lib/api";
import { getUserId } from "@/lib/session";
import { generateCrewConfigPy, generateOrchestratorPy } from "@/lib/crewCode";
import { crewDefineSegments } from "@/lib/freeformCode";
import { highlightPython } from "@/lib/highlightPython";
import { showToast } from "@/lib/effects";
import { useGameStore } from "@/lib/store";
import { CodeFrame, SegmentsView } from "@/components/freeform/CodePanel";

/** Multi-Agent Crew — own Build Type, own 4-level flow (FORGEFLOW_V3_SPEC.md
 * §6, §3b "Templates vs. Build Types"). Reuses the real Level/Mission
 * navigation pattern from Phase 2e (MissionIntro for both the Level-intro
 * and per-mission overview screens) and, for every actual sub-agent/
 * orchestrator build, the ENTIRE real single-agent flow (FreeformBuildScreen
 * itself, entered once per sub-agent) — this file only owns the crew-level
 * scaffolding (define roles, sequence the sub-agent builds, bake the
 * ROUTE_TO contract, and the real POST /api/crew/create deploy step). */

type CrewView = "level" | "overview" | "editor";

/** Resume/autosave (FIX 4) — same real mechanism and the same /api/progress
 * columns FreeformBuildScreen's own resume uses (§23), just under a
 * distinct activeCampaignId marker ("crew" vs "freeform") so the two
 * build types' snapshots never collide — only one of either can be the
 * single in-progress build at a time, matching the existing rule. */
const CREW_SNAPSHOT_KEY = "__crew";
interface CrewSnapshot {
  view: CrewView;
  levelIdx: number;
  startedLevels: number[];
  roleLabels: string[];
  crewDefined: boolean;
  subAgentIdx: number;
  subAgents: (ApiForgedAgent | null)[];
  orchestrator: ApiForgedAgent | null;
}

interface CrewMissionMeta {
  title: string;
  sitrepHtml: string;
  steps: { label: string; sub: string }[];
  reward: number;
}

function buildCrewLevels(
  roleLabels: string[]
): { title: string; description: string; missions: CrewMissionMeta[] }[] {
  return [
    {
      title: "Define the Crew",
      description:
        "How many real specialists does this crew need, and what does each one own? No fixed roles — you name them.",
      missions: [
        {
          title: "Define the Crew",
          sitrepHtml:
            "A crew is N real sub-agents plus a real orchestrator that routes between them. Decide how many specialists you need and give each a short role label — this is what the orchestrator will route on.",
          steps: [{ label: "Add each specialist", sub: "a short role label, free text, no fixed set" }],
          reward: 20,
        },
      ],
    },
    {
      title: "Build Each Sub-Agent",
      description:
        "Each specialist is a full real agent — its own identity, instructions, model, and optionally knowledge or tools — shipped independently.",
      missions: roleLabels.map((r) => ({
        title: r || "Untitled specialist",
        sitrepHtml: `Build <b>${r || "this specialist"}</b> exactly like any single agent — its own real identity, instructions, and model. It ships as its own real Lyzr agent with its own real <code>agent_id</code>.`,
        steps: [{ label: "Build the full agent", sub: "identity, instructions, model — real Ship" }],
        reward: 40,
      })),
    },
    {
      title: "Orchestrator",
      description:
        "One more real agent — the router. It decides whether to answer directly or hand off to a specialist.",
      missions: [
        {
          title: "Orchestrator",
          sitrepHtml:
            "The orchestrator is a real agent too, built the same way as any sub-agent. On Ship, its real <code>agent_instructions</code> automatically get a <b>ROUTE_TO</b> contract appended — the same real marker mechanism as <code>TOOL_CALL</code> — listing this crew's real specialists.",
          steps: [{ label: "Build the orchestrator", sub: "identity, instructions, model — real Ship" }],
          reward: 60,
        },
      ],
    },
    {
      title: "Deploy Crew",
      description: "Confirm every real agent is live, then wire the crew together for real.",
      missions: [
        {
          title: "Deploy Crew",
          sitrepHtml:
            "Every sub-agent and the orchestrator already exist as real, independently-shipped Lyzr agents — this writes the real <code>crews</code>/<code>crew_members</code> rows that tie them together (<code>POST /api/crew/create</code>).",
          steps: [
            { label: "Review the real composition", sub: "crew_config.py" },
            { label: "Deploy", sub: "POST /api/crew/create" },
          ],
          reward: 30,
        },
      ],
    },
  ];
}

export default function CrewBuildScreen() {
  const router = useRouter();
  const addXp = useGameStore((s) => s.addXp);

  const [view, setView] = useState<CrewView>("level");
  const [levelIdx, setLevelIdx] = useState(0);
  const [startedLevels, setStartedLevels] = useState<Set<number>>(new Set());

  const [roleLabels, setRoleLabels] = useState<string[]>(["", ""]);
  const [crewDefined, setCrewDefined] = useState(false);
  const [subAgentIdx, setSubAgentIdx] = useState(0);
  const [subAgents, setSubAgents] = useState<(ApiForgedAgent | null)[]>([]);
  const [orchestrator, setOrchestrator] = useState<ApiForgedAgent | null>(null);

  const [crewId, setCrewId] = useState<string | null>(null);

  const [resumeChecked, setResumeChecked] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const deployedRef = useRef(false); // mirrors crewId synchronously — same stale-closure guard §23 uses
  // True only between "a real edit scheduled a save" and "that save went
  // out" — without this, merely visiting /build/crew and closing without
  // touching anything would flush a blank/unchanged snapshot on unload,
  // and since saveProgress replaces the whole slotValues column (not just
  // this build's own key), that would silently wipe out any freeform or
  // template draft saved under a different key (found while fixing the
  // same-class bug in the freeform flow).
  const hasPendingEditRef = useRef(false);

  // Mirrors every render's latest state into a ref so the debounced
  // autosave (fired from a setTimeout) and the pagehide/beforeunload
  // flush always persist what's actually on screen, not a stale snapshot
  // from whenever the save was scheduled (same fix as FIX 4a's freeform race).
  const liveStateRef = useRef({
    view,
    levelIdx,
    startedLevels,
    roleLabels,
    crewDefined,
    subAgentIdx,
    subAgents,
    orchestrator,
  });
  liveStateRef.current = {
    view,
    levelIdx,
    startedLevels,
    roleLabels,
    crewDefined,
    subAgentIdx,
    subAgents,
    orchestrator,
  };

  useEffect(() => {
    getProgress(getUserId())
      .then((progress) => {
        const raw = progress.activeCampaignId === "crew" ? progress.slotValues[CREW_SNAPSHOT_KEY] : undefined;
        if (raw) {
          try {
            const snap = JSON.parse(raw) as CrewSnapshot;
            setRoleLabels(snap.roleLabels);
            setCrewDefined(snap.crewDefined);
            setSubAgents(snap.subAgents);
            setOrchestrator(snap.orchestrator);
            setStartedLevels(new Set(snap.startedLevels));

            // Never land back on a position that was already shipped right
            // before the snapshot was taken (closed the tab the instant
            // after "shipped!", before clicking "Continue to next
            // specialist") — that position's embedded FreeformBuildScreen
            // always starts blank, so resuming onto it would let the
            // developer re-ship a genuine duplicate real agent for the
            // same role. Skip forward to the first real gap instead.
            let resumeLevelIdx = snap.levelIdx;
            let resumeSubAgentIdx = snap.subAgentIdx;
            let resumeView = snap.view;
            if (snap.levelIdx === 1 && snap.subAgents[snap.subAgentIdx]) {
              const nextUnshipped = snap.subAgents.findIndex((a) => !a);
              if (nextUnshipped === -1) {
                resumeLevelIdx = 2;
                resumeSubAgentIdx = 0;
                resumeView = snap.startedLevels.includes(2) ? "overview" : "level";
              } else {
                resumeSubAgentIdx = nextUnshipped;
                // Level 1 ("Build Each Sub-Agent") itself was already
                // started — land on the next specialist's own
                // mission-overview, not the whole-Level intro again
                // (matches what clicking crewNext's Continue does normally).
                resumeView = snap.startedLevels.includes(1) ? "overview" : "level";
              }
            } else if (snap.levelIdx === 2 && snap.orchestrator) {
              resumeLevelIdx = 3;
              resumeView = snap.startedLevels.includes(3) ? "overview" : "level";
            }
            setLevelIdx(resumeLevelIdx);
            setSubAgentIdx(resumeSubAgentIdx);
            setView(resumeView);

            const shippedCount = snap.subAgents.filter(Boolean).length;
            showToast(
              "↺",
              `Resumed crew build — ${shippedCount} specialist${shippedCount === 1 ? "" : "s"} already shipped`
            );
          } catch {
            /* corrupt/old-shape snapshot — ignore, start fresh */
          }
        }
      })
      .catch(() => {
        /* backend unreachable — nothing to resume, start fresh */
      })
      .finally(() => setResumeChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildSnapshotPayload = () => {
    const s = liveStateRef.current;
    const snap: CrewSnapshot = {
      view: s.view,
      levelIdx: s.levelIdx,
      startedLevels: Array.from(s.startedLevels),
      roleLabels: s.roleLabels,
      crewDefined: s.crewDefined,
      subAgentIdx: s.subAgentIdx,
      subAgents: s.subAgents,
      orchestrator: s.orchestrator,
    };
    return {
      activeCampaignId: "crew" as const,
      currentMissionIndex: 0,
      slotValues: { [CREW_SNAPSHOT_KEY]: JSON.stringify(snap) },
      buildTimerSeconds: 0,
    };
  };

  const scheduleAutosave = () => {
    if (deployedRef.current) return;
    hasPendingEditRef.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveProgress(getUserId(), buildSnapshotPayload())
        .catch(() => {})
        .finally(() => {
          hasPendingEditRef.current = false;
        });
    }, 900);
  };

  // Same real fix as FIX 4a: a quick close/refresh right after an edit
  // (e.g. right after a sub-agent ships) races the 900ms debounce — flush
  // immediately on pagehide via a keepalive fetch so it survives unload.
  // Only if there's a genuinely real, unconfirmed edit — see hasPendingEditRef.
  useEffect(() => {
    const flush = () => {
      if (deployedRef.current || !hasPendingEditRef.current) return;
      clearTimeout(saveTimer.current);
      hasPendingEditRef.current = false;
      saveProgress(getUserId(), buildSnapshotPayload(), { keepalive: true }).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const levels = buildCrewLevels(roleLabels);
  const level = levels[levelIdx]!;
  const missionIdx = levelIdx === 1 ? subAgentIdx : 0;
  const mission = level.missions[missionIdx] ?? level.missions[0]!;
  const levelXP = level.missions.reduce((s, m) => s + m.reward, 0);

  const goToLevel = (idx: number, mIdx = 0) => {
    setLevelIdx(idx);
    if (idx === 1) setSubAgentIdx(mIdx);
    setView(startedLevels.has(idx) ? "overview" : "level");
    window.scrollTo({ top: 0, behavior: "smooth" });
    scheduleAutosave();
  };

  const startLevel = () => {
    setStartedLevels((prev) => new Set(prev).add(levelIdx));
    setView("overview");
    scheduleAutosave();
  };

  /** Back-navigation counterpart to goToLevel/startLevel, scoped ONLY to
   * levelIdx 0 (Define the Crew) — the one level here that isn't a
   * FreeformBuildScreen instance. Levels 1/2 embed FreeformBuildScreen keyed
   * per sub-agent/orchestrator; navigating back INTO one of those after
   * leaving it remounts it blank with no memory of already being shipped
   * (§34's "deliberately not added" finding) — real risk of a duplicate
   * Lyzr agent on re-ship. Never call this for levelIdx > 0. */
  const goToLevelEditor = (idx: number) => {
    setLevelIdx(idx);
    setView("editor");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const railSteps = levels.map((l) => ({ label: l.title, sub: `${l.missions.length} mission${l.missions.length === 1 ? "" : "s"}` }));
  const railChecked = levels.map((_, i) => {
    if (i === 0) return crewDefined;
    if (i === 1) return subAgents.length === roleLabels.length && subAgents.every(Boolean);
    if (i === 2) return !!orchestrator;
    return !!crewId;
  });
  const disabledIndices = levels.map((_, i) => i).filter((i) => !startedLevels.has(i) && i !== levelIdx);

  const backLink = (
    <div className="mx-auto max-w-[720px] px-6 pt-10">
      <button type="button" className="back-link" onClick={() => router.push("/campaigns")}>
        ← back to ForgeFlow
      </button>
    </div>
  );

  // Wait for the resume check before rendering anything — otherwise a
  // resumable crew build flashes Level 1's blank state for a moment
  // before snapping to whatever was actually restored (same fix §23's
  // freeform resume already applies).
  if (!resumeChecked) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-24 text-center">
        <p className="font-mono text-[12px] text-mute">Loading your build…</p>
      </div>
    );
  }

  if (view === "level") {
    // Only Level 1's intro has a SAFE predecessor to return to (Level 0's
    // own editor — not a FreeformBuildScreen instance). Level 0 is the true
    // first page; Levels 2/3's predecessors are FreeformBuildScreen
    // instances that would remount blank if re-entered (see goToLevelEditor
    // above) — no back button for those, matching §34.
    const onPrevLevel = levelIdx === 1 ? () => goToLevelEditor(0) : undefined;
    return (
      <div>
        {backLink}
        <MissionIntro
          missionNumber={levelIdx + 1}
          totalMissions={levels.length}
          kicker={`Level ${levelIdx + 1} of ${levels.length}`}
          title={level.title}
          descHtml={level.description}
          steps={level.missions.map((m) => ({ label: m.title, sub: `+${m.reward} XP · ${m.steps.map((s) => s.label).join(" / ")}` }))}
          reward={levelXP}
          rewardLabel="available"
          onBegin={startLevel}
          beginLabel="Start level →"
          onPrev={onPrevLevel}
        />
      </div>
    );
  }

  if (view === "overview") {
    // Safe only when this mission's own Level-intro is the real predecessor
    // (Level 0's single mission, or Level 1's FIRST sub-agent) — a later
    // sub-agent's overview would need to step back into an already-shipped
    // FreeformBuildScreen instance, the same unsafe remount case as above.
    const onPrevMission = levelIdx === 0 || (levelIdx === 1 && subAgentIdx === 0) ? () => setView("level") : undefined;
    return (
      <div>
        {backLink}
        <MissionIntro
          missionNumber={missionIdx + 1}
          totalMissions={level.missions.length}
          kicker={`Level ${levelIdx + 1} · Mission ${missionIdx + 1} of ${level.missions.length}`}
          title={mission.title}
          descHtml={mission.sitrepHtml}
          steps={mission.steps}
          reward={mission.reward}
          onBegin={() => setView("editor")}
          onBack={() => setView("editor")}
          beginLabel="Begin mission →"
          onPrev={onPrevMission}
        />
      </div>
    );
  }

  // ---- editor ----
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-10">
      <div className="subnav">
        <button type="button" className="back-link" onClick={() => router.push("/campaigns")}>
          ← back to ForgeFlow
        </button>
        <span className="font-mono text-[11px] text-mute">Multi-Agent Crew build</span>
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[206px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-[22px] lg:self-start">
          <MissionRail
            steps={railSteps}
            checked={railChecked}
            railTag={level.title}
            activeIndex={levelIdx}
            onSelect={(i) => goToLevel(i)}
            disabledIndices={disabledIndices}
            sticky={false}
          />
        </div>

        <div>
          {levelIdx === 0 && (
            <DefineCrewEditor
              roleLabels={roleLabels}
              setRoleLabels={setRoleLabels}
              onContinue={() => {
                addXp(mission.reward);
                showToast(`+${mission.reward} XP`, "Define the Crew complete");
                setCrewDefined(true);
                setSubAgents(roleLabels.map(() => null));
                goToLevel(1, 0);
              }}
              onRoleLabelsChanged={scheduleAutosave}
            />
          )}

          {levelIdx === 1 && (
            <FreeformBuildScreen
              key={`sub-${subAgentIdx}`}
              initialRoleHint={roleLabels[subAgentIdx]}
              onShipped={(agent) => {
                setSubAgents((prev) => {
                  const next = [...prev];
                  next[subAgentIdx] = agent;
                  return next;
                });
                scheduleAutosave();
              }}
              crewNext={{
                label:
                  subAgentIdx < roleLabels.length - 1
                    ? `Continue to "${roleLabels[subAgentIdx + 1]}" →`
                    : "Continue to Orchestrator →",
                onContinue: () => {
                  if (subAgentIdx < roleLabels.length - 1) {
                    goToLevel(1, subAgentIdx + 1);
                  } else {
                    goToLevel(2);
                  }
                },
              }}
            />
          )}

          {levelIdx === 2 && (
            <FreeformBuildScreen
              key="orchestrator"
              crewRoles={roleLabels}
              extraCodeFiles={[
                {
                  name: "crew_config.py",
                  content: generateCrewConfigPy(
                    roleLabels.map((r, i) => ({ roleLabel: r, agentId: subAgents[i]?.lyzrAgentId })),
                    undefined
                  ),
                  note: "the real crew composition (read-only)",
                },
                {
                  name: "orchestrator.py",
                  content: generateOrchestratorPy(roleLabels),
                  note: "the real routing logic (read-only)",
                },
              ]}
              onShipped={(agent) => {
                setOrchestrator(agent);
                scheduleAutosave();
              }}
              crewNext={{ label: "Continue to Deploy →", onContinue: () => goToLevel(3) }}
            />
          )}

          {levelIdx === 3 && (
            <DeployCrewEditor
              roleLabels={roleLabels}
              subAgents={subAgents}
              orchestrator={orchestrator}
              crewId={crewId}
              onDeployed={(id) => {
                setCrewId(id);
                addXp(mission.reward);
                showToast(`+${mission.reward} XP`, "Crew deployed");
                // Deployed for real — nothing left to resume into, same
                // as ship() clearing freeform's own progress record.
                deployedRef.current = true;
                clearTimeout(saveTimer.current);
                saveProgress(getUserId(), { activeCampaignId: null, slotValues: {} }).catch(() => {});
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DefineCrewEditor({
  roleLabels,
  setRoleLabels,
  onContinue,
  onRoleLabelsChanged,
}: {
  roleLabels: string[];
  setRoleLabels: (labels: string[]) => void;
  onContinue: () => void;
  onRoleLabelsChanged?: () => void;
}) {
  const valid = roleLabels.length > 0 && roleLabels.every((r) => r.trim().length > 0);
  const setAndAutosave = (labels: string[]) => {
    setRoleLabels(labels);
    onRoleLabelsChanged?.();
  };
  const segments = crewDefineSegments(roleLabels, setAndAutosave);

  return (
    <div
      className="rounded-2xl border border-line p-[26px]"
      style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
    >
      <h2 className="mb-1 font-display text-lg font-semibold">Define the Crew</h2>
      <p className="mb-5 font-mono text-[11.5px] text-mute">
        One row per specialist, typed directly into the real crew_config.py below. The role label is
        what the orchestrator routes on later — be specific.
      </p>

      <CodeFrame
        tabs={["crew_config.py"]}
        active="crew_config.py"
        onSelectFile={() => {}}
        fileNote="watching crew_config.py — fill the highlighted slots to add each specialist"
      >
        <SegmentsView segments={segments} />
      </CodeFrame>

      <div className="mt-6 border-t border-line pt-5">
        <button
          type="button"
          disabled={!valid}
          onClick={onContinue}
          className={`rounded-[10px] px-[26px] py-3 text-sm font-semibold transition-all ${
            valid ? "cursor-pointer text-on-accent hover:-translate-y-0.5" : "cursor-not-allowed border border-line bg-panel-3 text-mute"
          }`}
          style={
            valid
              ? {
                  background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
                  boxShadow: "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)",
                }
              : undefined
          }
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

function DeployCrewEditor({
  roleLabels,
  subAgents,
  orchestrator,
  crewId,
  onDeployed,
}: {
  roleLabels: string[];
  subAgents: (ApiForgedAgent | null)[];
  orchestrator: ApiForgedAgent | null;
  crewId: string | null;
  onDeployed: (crewId: string) => void;
}) {
  const router = useRouter();
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allReady = !!orchestrator && subAgents.length === roleLabels.length && subAgents.every(Boolean);

  const configPy = generateCrewConfigPy(
    roleLabels.map((r, i) => ({ roleLabel: r, agentId: subAgents[i]?.lyzrAgentId })),
    orchestrator?.lyzrAgentId
  );

  const deploy = async () => {
    if (!allReady || deploying || crewId) return;
    setDeploying(true);
    setError(null);
    try {
      const result = await createCrew({
        userId: getUserId(),
        orchestratorForgedAgentId: orchestrator!.id,
        members: roleLabels.map((r, i) => ({ roleLabel: r, forgedAgentId: subAgents[i]!.id })),
      });
      onDeployed(result.crewId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deploy crew.");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div
      className="rounded-2xl border border-line p-[26px]"
      style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
    >
      <h2 className="mb-1 font-display text-lg font-semibold">Deploy Crew</h2>
      <p className="mb-5 font-mono text-[11.5px] text-mute">
        {crewId
          ? "Deployed for real — the crew record below is what's actually stored."
          : "Every id below is real once shipped. Nothing here is invented."}
      </p>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-code-bg p-4 font-mono text-[12px]">
        <div className="flex justify-between gap-4">
          <span className="text-mute">orchestrator</span>
          <span className="text-right text-text">
            {orchestrator ? `${orchestrator.name} · ${orchestrator.lyzrAgentId}` : "not shipped yet"}
          </span>
        </div>
        {roleLabels.map((r, i) => (
          <div key={i} className="flex justify-between gap-4">
            <span className="text-mute">{r || `specialist ${i + 1}`}</span>
            <span className="text-right text-text">
              {subAgents[i] ? `${subAgents[i]!.name} · ${subAgents[i]!.lyzrAgentId}` : "not shipped yet"}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-code-bg">
        <p className="border-b border-line bg-panel px-4 py-2 font-mono text-[10.5px] text-mute">
          crew_config.py — the real composition {crewId ? "(deployed)" : "(preview)"}
        </p>
        <pre
          className="overflow-auto px-4 py-4 font-mono text-[13px] leading-[2.02] text-[var(--color-code-text)]"
          style={{ maxHeight: 320, whiteSpace: "pre" }}
        >
          {/* eslint-disable-next-line react/no-danger */}
          <code dangerouslySetInnerHTML={{ __html: highlightPython(configPy) }} />
        </pre>
      </div>

      {!allReady && (
        <p className="mt-4 font-mono text-[11.5px] text-amber">
          ⚠ Finish shipping every specialist and the orchestrator before deploying.
        </p>
      )}
      {error && <p className="mt-4 font-mono text-[11.5px] text-rose">⚠ {error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        {crewId ? (
          <>
            <span className="font-mono text-[11.5px] text-spring">✓ Crew live — crew_id {crewId}</span>
            <button
              type="button"
              onClick={() => router.push(`/crew/${crewId}/chat`)}
              className="rounded-[10px] px-[26px] py-3 text-sm font-semibold text-on-accent transition-all hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
                boxShadow: "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)",
              }}
            >
              💬 Talk to the Crew
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!allReady || deploying}
            onClick={deploy}
            className="rounded-[10px] px-[26px] py-3 text-sm font-semibold text-on-accent transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            style={{
              background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
              boxShadow: "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)",
            }}
          >
            {deploying ? "⏳ Deploying…" : "🚀 Deploy Crew"}
          </button>
        )}
      </div>
    </div>
  );
}
