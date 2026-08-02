"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAgent,
  saveProgress,
  getProgress,
  LyzrNotConfiguredError,
  type ApiForgedAgent,
} from "@/lib/api";
import { getUserId } from "@/lib/session";
import { getTemplate, getTemplateLevelDefaults } from "@/lib/agentTemplates";
import { getCampaign } from "@/lib/campaigns";
import { blankDraft, type AgentDraft } from "@/lib/types";
import {
  activeMissions,
  activeLevels,
  levelForMission,
  canonicalLevelNumber,
  getMission,
  missionValidate,
  shipBlockingCount,
  ASSISTANT_TABS,
  type FreeformMission,
  type MissionKey,
  type LevelId,
} from "@/lib/freeformMissions";
import { lintField, fieldOwnerMission, type FieldKey, type LintCtx } from "@/lib/freeformLint";
import { buildFreeformBlueprint, blueprintLiveState } from "@/lib/freeformBlueprint";
import { showToast } from "@/lib/effects";
import { useGameStore } from "@/lib/store";
import CodePanel, { type FileName, type SlotState, type CodeExtraFile } from "@/components/freeform/CodePanel";
import KnowledgeUploadForm from "@/components/knowledge/KnowledgeUploadForm";
import TestConsole from "@/components/hub/TestConsole";
import MissionIntro from "@/components/build/MissionIntro";
import MissionRail from "@/components/build/MissionRail";
import LiveBlueprint from "@/components/build/LiveBlueprint";
import AssistantTabs from "@/components/build/AssistantTabs";
import ConsolePanel, { type ConsoleLine } from "@/components/build/ConsolePanel";

function fieldLabel(text: string) {
  return (
    <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-[.06em] text-mute">
      {text}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-line bg-code-bg px-3 py-2.5 font-mono text-[13px] text-text outline-none focus:border-violet";

/** Presentational-only metadata for the Situation Report chips — authored
 * per mission the same way the legacy campaigns authored `difficulty` /
 * `estimateMin` (not computed, not from an API). Kept here rather than in
 * freeformMissions.ts so the verified §19 logic module stays untouched. */
const MISSION_META: Record<MissionKey, { difficulty: string; estimateMin: number }> = {
  identity: { difficulty: "Easy", estimateMin: 4 },
  instructions: { difficulty: "Medium", estimateMin: 8 },
  model: { difficulty: "Easy", estimateMin: 5 },
  retrieval: { difficulty: "Easy", estimateMin: 5 },
  toolDefine: { difficulty: "Medium", estimateMin: 6 },
  toolWire: { difficulty: "Easy", estimateMin: 4 },
  ship: { difficulty: "Easy", estimateMin: 3 },
  upload: { difficulty: "Easy", estimateMin: 4 },
};

/** Everything needed to resume an in-progress freeform build exactly where
 * it was left off — persisted to the same `users.build_slot_values` JSON
 * column campaign builds already autosave into (one active build at a
 * time, same as campaigns: `activeCampaignId: "freeform"` is the marker),
 * under a single key so no backend schema change is needed. */
interface FreeformSnapshot {
  draft: AgentDraft;
  rawTemp: string;
  rawTopK: string;
  current: MissionKey;
  completed: MissionKey[];
  wantsKnowledge: boolean;
  wantsTools: boolean;
  startedLevels: LevelId[];
  startedAt: number;
  xpEarnedSoFar: number;
  /** Which ?template=<id> (or null for "Start from scratch") this saved
   * draft was started under — resume only offers a draft back when it
   * matches the template currently being requested, so clicking "Retriever
   * Agent" never silently resumes an in-progress Tool-Using Agent draft. */
  templateId: string | null;
}
const FREEFORM_SNAPSHOT_KEY = "__freeform";

export default function FreeformBuildScreen({
  templateId,
  onShipped,
  crewNext,
  initialRoleHint,
  crewRoles,
  extraCodeFiles,
  onBack,
}: {
  templateId?: string;
  /** Multi-Agent Crew only (Phase 5, FORGEFLOW_V3_SPEC.md §6) — fired the
   * instant ship() succeeds, so the crew flow can capture the real
   * agent_id immediately rather than waiting for the developer to click
   * through the post-ship hub. */
  onShipped?: (agent: ApiForgedAgent) => void;
  /** Crew only — when present, replaces "+ Ship another agent" (both on
   * the Ship hub and after Upload's "Finish build") with this label/action,
   * since "ship another agent" is the wrong affordance mid-crew-build. */
  crewNext?: { label: string; onContinue: () => void };
  /** Crew only — pre-seeds the Identity mission's role field as a
   * placeholder hint (never a filled default, same §2d rule templates
   * follow) from the crew's Level-1 role label for this sub-agent. */
  initialRoleHint?: string;
  /** Crew orchestrator only — real role labels of this crew's
   * already-shipped sub-agents, sent straight through to POST
   * /api/agent/create so the backend bakes the real ROUTE_TO contract. */
  crewRoles?: string[];
  /** Crew orchestrator only — real generated crew_config.py/orchestrator.py
   * shown as extra CodePanel tabs. */
  extraCodeFiles?: CodeExtraFile[];
  /** Crew only — overrides the "← back to ForgeFlow" navigation, since
   * within a crew build that link would silently abandon the whole crew. */
  onBack?: () => void;
}) {
  const router = useRouter();
  const addXp = useGameStore((s) => s.addXp);
  // Crew sub-agent/orchestrator builds are embedded inside CrewBuildScreen,
  // not a standalone `/build/new` visit — they must not participate in the
  // single-slot freeform resume/autosave mechanism (§2g), which assumes
  // exactly one in-progress freeform build at a time.
  const crewMode = !!(onShipped || crewNext);

  // A cloned template is a starting *hint*, not a filled-in default (§3b).
  // The draft begins blank so every field reads as "fill me"; the template's
  // values surface only as placeholders (see `hints`), and the developer
  // still actively chooses each one.
  const template = getTemplate(templateId);
  const [draft, setDraft] = useState<AgentDraft>(() =>
    template
      ? { ...blankDraft(), name: "", role: "", goal: "", instructions: "", model: "", tools: [] }
      : blankDraft()
  );
  const hints: Partial<Record<FieldKey, string>> | null = template
    ? {
        name: template.name,
        role: template.role,
        goal: template.goal,
        instructions: template.instructions,
        temperature: String(template.temperature),
        topK: String(template.knowledge?.topK ?? 4),
      }
    : initialRoleHint
      ? { role: initialRoleHint }
      : null;
  // Structural Level defaults implied by the chosen template — which
  // Levels are visible in the Build Map, not what's typed into them (§2d
  // still governs field values separately, via `hints` above).
  const [wantsKnowledge, setWantsKnowledge] = useState(
    () => !!getTemplateLevelDefaults(templateId).wantsKnowledge
  );
  const [wantsTools, setWantsTools] = useState(
    () =>
      (getTemplate(templateId)?.tools?.length ?? 0) > 0 ||
      !!getTemplateLevelDefaults(templateId).wantsTools
  );
  const [completed, setCompleted] = useState<Set<MissionKey>>(new Set());
  const [current, setCurrent] = useState<MissionKey>("identity");
  // "level" = the Level-intro pre-screen (shown once per level, before its
  // first mission's overview); "overview" = the mission-intro; "editor" =
  // the 3-column editor.
  const [view, setView] = useState<"level" | "overview" | "editor">("level");
  const [startedLevels, setStartedLevels] = useState<Set<LevelId>>(new Set());
  const [assistantTab, setAssistantTab] = useState(0);

  const [created, setCreated] = useState<ApiForgedAgent | null>(null);
  const [shipping, setShipping] = useState(false);
  const [shipError, setShipError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  // Numeric slots are typed as free text in the code editor; their raw
  // strings live here so the SAME lint that gates Continue/Ship can reject
  // "5" or "abc" rather than silently clamping (FIX 2).
  // Blank for a template so the numeric slots show the template value as a
  // placeholder hint (and read as blocking) until the developer types one.
  const [rawTemp, setRawTemp] = useState(() => (template ? "" : String(blankDraft().temperature)));
  const [rawTopK, setRawTopK] = useState(() =>
    template ? "" : String(blankDraft().knowledge?.topK ?? 4)
  );
  // Debounced streaming console log (reference's pushConsole), reset per mission.
  const [consoleLog, setConsoleLog] = useState<ConsoleLine[]>([]);

  const xpAwarded = useRef<Set<MissionKey>>(new Set());
  const xpEarnedRef = useRef(0);
  const startedAt = useRef(Date.now());
  const sessionIdRef = useRef(crypto.randomUUID());
  const consoleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const consoleId = useRef(0);
  const [resumeChecked, setResumeChecked] = useState(false);
  // Real "table of contents" entry screen (FIX 1) — shown once, only on a
  // genuinely fresh/unstarted build, listing every active Level by name
  // before diving into Level 1's own mission breakdown (which is what the
  // very first screen used to show directly). Gated on real progress being
  // empty (not just this flag) so a resumed in-progress draft never sees
  // it again, regardless of what this flag initializes to.
  const [buildOverviewSeen, setBuildOverviewSeen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // True only between "a real edit/navigation scheduled a save" and "that
  // save actually went out" — the pagehide/beforeunload flush below checks
  // this before writing anything. Without it, simply visiting the builder
  // (e.g. a different template) and closing without ever touching a field
  // would unconditionally flush a blank draft, silently clobbering a real
  // in-progress draft already saved under the same __freeform slot for a
  // different template (found while verifying real cross-template resume).
  const hasPendingEditRef = useRef(false);
  // Mirrors `created` synchronously (setCreated itself is async and hasn't
  // flushed by the time ship() calls awardMission(), which schedules an
  // autosave of its own — without this, that stale-closure autosave would
  // fire ~900ms later and re-write the very record ship() just told the
  // backend to clear).
  const createdRef = useRef<ApiForgedAgent | null>(null);

  const update = (patch: Partial<AgentDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const missions = useMemo(
    () => activeMissions({ wantsKnowledge, wantsTools }),
    [wantsKnowledge, wantsTools]
  );
  const lvls = useMemo(
    () => activeLevels({ wantsKnowledge, wantsTools }),
    [wantsKnowledge, wantsTools]
  );
  const uploadUnlocked = !!created; // Upload mission needs a real agent_id

  // Single validation context — every check (slot color, console, badges,
  // Continue, Ship) reads from this via freeformLint. No duplicate logic.
  const ctx: LintCtx = { draft, rawTemp, rawTopK };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // Mirrors every render's latest values into a ref so the debounced
  // autosave below (fired from a setTimeout, which otherwise closes over
  // whatever these were at schedule-time) always persists what's actually
  // on screen, not a stale snapshot from the keystroke that scheduled it.
  const liveStateRef = useRef({ draft, rawTemp, rawTopK, current, completed, wantsKnowledge, wantsTools, startedLevels });
  liveStateRef.current = { draft, rawTemp, rawTopK, current, completed, wantsKnowledge, wantsTools, startedLevels };

  // ---- resume: one active freeform build at a time, same as campaigns ----
  // Real templates (?template=<id>) used to skip this check entirely,
  // treating every template visit as "start fresh" — the actual reason
  // resume looked like a freeform-only feature (row: fix). Now it checks
  // for a saved draft the same way scratch always has, but only resumes
  // it when the draft's own stored templateId matches what's being
  // requested now — so clicking "Retriever Agent" while a Tool-Using
  // Agent draft is saved still starts fresh rather than silently showing
  // the wrong in-progress build. Crew sub-agents keep their own separate
  // resume (CrewBuildScreen), unaffected.
  useEffect(() => {
    if (crewMode) {
      setResumeChecked(true);
      return;
    }
    const requestedTemplateId = templateId ?? null;
    getProgress(getUserId())
      .then((progress) => {
        const raw = progress.activeCampaignId === "freeform" ? progress.slotValues[FREEFORM_SNAPSHOT_KEY] : undefined;
        if (raw) {
          try {
            const snap = JSON.parse(raw) as FreeformSnapshot;
            if ((snap.templateId ?? null) !== requestedTemplateId) return;
            setDraft(snap.draft);
            setRawTemp(snap.rawTemp);
            setRawTopK(snap.rawTopK);
            setWantsKnowledge(snap.wantsKnowledge);
            setWantsTools(snap.wantsTools);
            setCompleted(new Set(snap.completed));
            setStartedLevels(new Set(snap.startedLevels));
            setCurrent(snap.current);
            setView("editor");
            xpAwarded.current = new Set(snap.completed);
            xpEarnedRef.current = snap.xpEarnedSoFar;
            startedAt.current = snap.startedAt;
            showToast(
              "↺",
              `Resumed — ${snap.completed.length} mission${snap.completed.length === 1 ? "" : "s"} already done`
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

  /** Builds the exact snapshot + saveProgress payload from whatever's
   * currently live — shared by the debounced path below and the
   * immediate unload-flush path, so there's exactly one definition of
   * "what gets saved," not two that could drift apart. */
  const buildAutosavePayload = () => {
    const s = liveStateRef.current;
    const snap: FreeformSnapshot = {
      draft: s.draft,
      rawTemp: s.rawTemp,
      rawTopK: s.rawTopK,
      current: s.current,
      completed: Array.from(s.completed),
      wantsKnowledge: s.wantsKnowledge,
      wantsTools: s.wantsTools,
      startedLevels: Array.from(s.startedLevels),
      startedAt: startedAt.current,
      xpEarnedSoFar: xpEarnedRef.current,
      templateId: templateId ?? null,
    };
    return {
      activeCampaignId: "freeform" as const,
      currentMissionIndex: 0,
      slotValues: { [FREEFORM_SNAPSHOT_KEY]: JSON.stringify(snap) },
      buildTimerSeconds: 0,
    };
  };

  /** Debounced, backend-persisted autosave — fires on every field edit and
   * at mission-navigation checkpoints, matching how the campaign build
   * flow autosaves on every slot fill. No-ops once shipped: `ship()`
   * already clears this same record server-side (see backend agent.ts),
   * so there is nothing left to resume into. */
  const scheduleAutosave = () => {
    if (createdRef.current || crewMode) return;
    hasPendingEditRef.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveProgress(getUserId(), buildAutosavePayload())
        .catch(() => {
          /* non-blocking — worst case this edit isn't resumable, nothing else breaks */
        })
        .finally(() => {
          hasPendingEditRef.current = false;
        });
    }, 900);
  };

  // A real close/refresh mid-edit races the 900ms debounce above — if the
  // tab closes before the timer fires, that edit is silently lost and the
  // build looks like it never resumed (the actual bug behind the "resume
  // doesn't work" report: it worked once autosave had already fired, but
  // a quick close right after typing beat the debounce every time). This
  // flushes whatever's live immediately on pagehide, via a keepalive
  // fetch so the browser finishes sending it even as the page unloads.
  useEffect(() => {
    if (crewMode) return;
    const flush = () => {
      if (createdRef.current || !hasPendingEditRef.current) return;
      clearTimeout(saveTimer.current);
      hasPendingEditRef.current = false;
      saveProgress(getUserId(), buildAutosavePayload(), { keepalive: true }).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewMode]);

  // Ship is gated on the same lint as every field-bearing mission.
  const canShip = shipBlockingCount(missions, ctx) === 0 && !created;

  const slotState = (field: FieldKey): SlotState => {
    const line = lintField(field, ctx);
    if (line.blocking && !line.ok) return "empty";
    if (line.warn) return "warn";
    return "ok";
  };

  const onNumericChange = (field: "temperature" | "topK", raw: string) => {
    if (field === "temperature") {
      setRawTemp(raw);
      const n = parseFloat(raw);
      if (!Number.isNaN(n)) update({ temperature: n });
    } else {
      setRawTopK(raw);
      const k = Number(raw);
      if (Number.isInteger(k) && k >= 1) update({ knowledge: { topK: k } });
    }
  };

  /** Debounced console line for the just-edited field, using the SAME
   * lintField the badges/gating use — the streaming log mirrors the gate. */
  const onFieldEdit = (field: FieldKey) => {
    scheduleAutosave();
    clearTimeout(consoleTimer.current);
    consoleTimer.current = setTimeout(() => {
      const line = lintField(field, ctxRef.current);
      setConsoleLog((prev) => [
        ...prev.filter((l) => l.field !== field),
        {
          id: consoleId.current++,
          field: line.field,
          type: line.ok && !line.warn ? "ok" : "warn",
          icon: line.icon,
          msg: line.msg,
        },
      ]);
    }, 380);
  };

  useEffect(() => () => clearTimeout(consoleTimer.current), []);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // ---- navigation ----
  /** Enter a mission. If its level hasn't shown its Level-intro yet, show
   * that first; otherwise go straight to the mission overview. `force`
   * bypasses the Upload lock (used right after Ship, when `created` state
   * hasn't flushed yet but we hold the fresh agent in hand). */
  const goToMission = (key: MissionKey, force = false) => {
    if (key === "upload" && !uploadUnlocked && !force) return; // locked pre-ship
    setCurrent(key);
    setConsoleLog([]);
    const lvlId = levelForMission(key).id;
    setView(startedLevels.has(lvlId) ? "overview" : "level");
    window.scrollTo({ top: 0, behavior: "smooth" });
    scheduleAutosave();
  };

  const startLevel = (lvlId: LevelId) => {
    setStartedLevels((prev) => new Set(prev).add(lvlId));
    setView("overview");
    scheduleAutosave();
  };

  /** Back-navigation counterpart to goToMission/startLevel/completeMission —
   * jumps straight into a mission's editor (skipping its own overview
   * screen, since going "back" into a mission means returning to where you
   * left off working, not re-showing its recap). Used only for backward
   * moves within this same component instance (never across a Crew
   * sub-agent boundary — see §34's "deliberately not added" note). */
  const goToMissionEditor = (key: MissionKey) => {
    setCurrent(key);
    setConsoleLog([]);
    setView("editor");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const awardMission = (mission: FreeformMission) => {
    setCompleted((prev) => new Set(prev).add(mission.key));
    if (!xpAwarded.current.has(mission.key)) {
      xpAwarded.current.add(mission.key);
      xpEarnedRef.current += mission.reward;
      addXp(mission.reward);
      showToast(`+${mission.reward} XP`, `${mission.title} complete`);
      const state = useGameStore.getState();
      saveProgress(getUserId(), { xp: state.xp }).catch(() => {
        /* non-blocking — HUD already updated */
      });
    }
    scheduleAutosave();
  };

  /** Complete a field/tool mission (Continue button) and advance. Ship and
   * Upload have their own completion triggers (deploy / finish). */
  const completeMission = (mission: FreeformMission) => {
    awardMission(mission);
    const idx = missions.findIndex((m) => m.key === mission.key);
    const next = missions[idx + 1];
    if (next) goToMission(next.key);
  };

  const ship = async () => {
    if (shipping || created || !canShip) return;
    setShipping(true);
    setShipError(null);
    setNotConfigured(false);
    try {
      const result = await createAgent({
        userId: getUserId(),
        campaignId: "custom",
        name: draft.name.trim(),
        instructions: draft.instructions.trim(),
        model: draft.model,
        temperature: draft.temperature,
        role: draft.role.trim() || undefined,
        goal: draft.goal.trim() || undefined,
        config: {},
        forgeTime: Math.round((Date.now() - startedAt.current) / 1000),
        xpEarned: xpEarnedRef.current,
        estimateMin: 15,
        tools: (draft.tools ?? []).map((t) => ({
          toolName: t.name,
          description: t.description,
          paramsSchema: t.paramsSchema,
          endpointUrl: t.endpointUrl,
        })),
        crewRoles,
        templateId: templateId ?? null,
      });
      setCreated(result);
      createdRef.current = result;
      clearTimeout(saveTimer.current);
      showToast("🚀", "Agent shipped — a real Lyzr agent is live.");
      // Ship is a real mission — award its XP now that the agent exists.
      awardMission(getMission("ship"));
      onShipped?.(result);
      // Upload only becomes reachable once a real agent_id exists. If the
      // build included Knowledge, advance straight into it (force past the
      // lock, since `created` state hasn't flushed this tick).
      if (wantsKnowledge) goToMission("upload", true);
    } catch (err) {
      if (err instanceof LyzrNotConfiguredError) {
        setNotConfigured(true);
        setShipError(err.message);
      } else {
        setShipError(err instanceof Error ? err.message : "Failed to ship agent.");
      }
    } finally {
      setShipping(false);
    }
  };

  const shipAnother = () => {
    setCreated(null);
    createdRef.current = null;
    setDraft(blankDraft());
    setRawTemp(String(blankDraft().temperature));
    setRawTopK(String(blankDraft().knowledge?.topK ?? 4));
    setWantsKnowledge(false);
    setWantsTools(false);
    setCompleted(new Set());
    setStartedLevels(new Set());
    setConsoleLog([]);
    xpAwarded.current = new Set();
    xpEarnedRef.current = 0;
    setShipError(null);
    setNotConfigured(false);
    startedAt.current = Date.now();
    sessionIdRef.current = crypto.randomUUID();
    setCurrent("identity");
    setView("level");
  };

  // ---- level context for the current mission ----
  const mission = getMission(current);
  const currentLevel = levelForMission(current);
  const levelGroup = lvls.find((g) => g.level.id === currentLevel.id)!;
  const levelNumber = lvls.findIndex((g) => g.level.id === currentLevel.id) + 1;
  const missionIdxInLevel = levelGroup.missions.findIndex((m) => m.key === current);
  const levelXP = levelGroup.missions.reduce((s, m) => s + m.reward, 0);

  // Embedded in a Crew build (crewMode), CrewBuildScreen already renders
  // its own persistent "← back to ForgeFlow" + "Multi-Agent Crew build"
  // header around this whole component — render nothing here instead of
  // stacking a second, redundant one on top of it.
  const backLink = crewMode ? null : (
    <div className="mx-auto max-w-[720px] px-6 pt-10">
      <button type="button" className="back-link" onClick={() => (onBack ? onBack() : router.push("/campaigns"))}>
        ← back to ForgeFlow
      </button>
    </div>
  );

  // Wait for the resume check before rendering anything — otherwise a
  // resumable build flashes its default Level 1/blank-draft state for a
  // moment before snapping to whatever was actually restored.
  if (!resumeChecked) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-24 text-center">
        <p className="font-mono text-[12px] text-mute">Loading your build…</p>
      </div>
    );
  }

  // ---- Build Overview (FIX 1) — the real first screen: what levels this
  // build actually has, before Level 1's own intro. Never shown for a
  // Crew sub-agent (CrewBuildScreen's own "Build Each Sub-Agent" mission
  // already explains that framing) or once any real progress exists. ----
  if (!crewMode && !buildOverviewSeen && startedLevels.size === 0 && completed.size === 0) {
    const buildTitle = templateId ? (getCampaign(templateId)?.title ?? "Freeform Build") : "Freeform Build";
    const totalXP = lvls.reduce((s, g) => s + g.missions.reduce((s2, m) => s2 + m.reward, 0), 0);
    return (
      <div>
        {backLink}
        <MissionIntro
          missionNumber={1}
          totalMissions={1}
          kicker="Your build"
          title={buildTitle}
          descHtml={`This build has <b>${lvls.length} level${lvls.length === 1 ? "" : "s"}</b>. Each one ships real, working pieces of the agent — nothing here is simulated.`}
          steps={lvls.map((g, i) => ({
            label: `Level ${i + 1} — ${g.level.title}`,
            sub: g.level.description,
          }))}
          reward={totalXP}
          rewardLabel="available across the whole build"
          onBegin={() => setBuildOverviewSeen(true)}
          beginLabel="Start building →"
        />
      </div>
    );
  }

  // ---- Level-intro pre-screen (reuses MissionIntro; shown once per level
  //      before that level's first mission overview) ----
  if (view === "level") {
    // Chain-symmetric back: Level 1's intro is preceded only by the Build
    // Overview screen (re-shown by clearing the "seen" flag); every later
    // level's intro is preceded by the previous level's LAST mission editor
    // (mirroring how that mission's own Continue led here).
    const onPrevLevel = crewMode
      ? undefined
      : levelNumber === 1
        ? () => setBuildOverviewSeen(false)
        : () => {
            const prevGroup = lvls[levelNumber - 2]!;
            goToMissionEditor(prevGroup.missions[prevGroup.missions.length - 1]!.key);
          };
    return (
      <div>
        {backLink}
        <MissionIntro
          missionNumber={levelNumber}
          totalMissions={lvls.length}
          kicker={`Level ${levelNumber} of ${lvls.length}`}
          title={currentLevel.title}
          descHtml={currentLevel.description}
          // Each "step" is a mission in this level, with its real XP.
          steps={levelGroup.missions.map((m) => ({
            label: m.title,
            sub: `+${m.reward} XP · ${m.steps.map((s) => s.label).join(" / ")}`,
          }))}
          reward={levelXP}
          rewardLabel="available"
          onBegin={() => startLevel(currentLevel.id)}
          beginLabel="Start level →"
          onPrev={onPrevLevel}
        />
      </div>
    );
  }

  // ---- mission-overview pre-screen ----
  if (view === "overview") {
    // Chain-symmetric back: the first mission of a level is preceded by
    // that level's own intro; any later mission is preceded by the
    // PREVIOUS mission's editor (mirroring that mission's own Continue).
    const onPrevMission =
      missionIdxInLevel === 0
        ? () => setView("level")
        : () => goToMissionEditor(levelGroup.missions[missionIdxInLevel - 1]!.key);
    return (
      <div>
        {backLink}
        <MissionIntro
          missionNumber={missionIdxInLevel + 1}
          totalMissions={levelGroup.missions.length}
          kicker={`Level ${levelNumber} · Mission ${missionIdxInLevel + 1} of ${levelGroup.missions.length}`}
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

  // ---- 3-column editor ----
  // Build Map = the flat list of active missions (ship + upload included),
  // grouped into real Level section headers — computed from the same
  // `lvls` (activeLevels()) that drives the Level-intro screens, not a
  // second source of truth for the grouping.
  const railSteps = missions.map((m) => ({ label: m.title, sub: m.railTag }));
  const railChecked = missions.map((m) => completed.has(m.key));
  const activeIndex = missions.findIndex((m) => m.key === current);
  // Progressive disclosure: a code-editor field is interactive once its
  // owning mission is at or before the mission currently being edited, OR
  // that mission has already been completed (so backtracking to an earlier
  // mission — e.g. to fix Identity — doesn't re-lock a later mission's
  // fields you'd already finished). Fields belonging to a mission not yet
  // reached stay genuinely inert. Reuses the real mission/field mapping in
  // freeformLint.ts (fieldOwnerMission) — no second mapping.
  const isFieldUnlocked = (field: FieldKey): boolean => {
    const ownerKey = fieldOwnerMission(field);
    if (!ownerKey) return true; // fields with no owning mission are never gated
    if (completed.has(ownerKey as MissionKey)) return true;
    const ownerIndex = missions.findIndex((m) => m.key === ownerKey);
    return ownerIndex >= 0 && ownerIndex <= activeIndex;
  };
  const disabledIndices = uploadUnlocked
    ? []
    : missions.map((m, i) => (m.key === "upload" ? i : -1)).filter((i) => i >= 0);
  const railSections = (() => {
    let idx = 0;
    return lvls.map((g) => {
      const startIndex = idx;
      idx += g.missions.length;
      // Canonical number (Deploy is always "LEVEL 4", per §3b), not the
      // sequential position within whichever optional levels are active.
      return {
        label: `Level ${canonicalLevelNumber(g.level.id)} — ${g.level.title.toUpperCase()}`,
        startIndex,
      };
    });
  })();

  const onRailSelect = (i: number) => goToMission(missions[i]!.key);

  const bp = buildFreeformBlueprint(wantsKnowledge);
  const bpState = blueprintLiveState(draft, wantsKnowledge, !!created);

  const isToolMission = current === "toolDefine" || current === "toolWire";

  // Badge counts read the live per-mission lint directly (immediate, real);
  // the console body streams debounced lines as fields are edited.
  const validation = missionValidate(mission, ctx);
  const blocking = validation.filter((l) => l.blocking && !l.ok).length;
  const passed = validation.filter((l) => l.ok).length;
  const defaultFile: FileName =
    current === "retrieval" ? "qdrant_setup.py" : isToolMission ? "tool_handler.py" : "agent.py";
  const isLastMission = activeIndex === missions.length - 1;

  return (
    <div className={crewMode ? "" : "mx-auto max-w-[1400px] px-6 py-10"}>
      {/* Embedded in a Crew build, CrewBuildScreen's own header (and its
          matching mx-auto max-w-[1400px] px-6 py-10 wrapper, above) already
          covers this — rendering it again here just stacks a duplicate. */}
      {!crewMode && (
        <div className="subnav">
          <button type="button" className="back-link" onClick={() => (onBack ? onBack() : router.push("/campaigns"))}>
            ← back to ForgeFlow
          </button>
          <span className="font-mono text-[11px] text-mute">
            Freeform build{templateId ? ` · from "${templateId}" template` : ""}
          </span>
        </div>
      )}

      {/* minmax(0,1fr) on the center track lets it shrink below its wide
          code content instead of pushing the third (Live Agent) column off
          the viewport — the FIX 3 overflow bug. */}
      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[206px_minmax(0,1fr)_344px]">
        {/* LEFT — Build Map. The whole column pins as one unit (self-start
            so the grid item stays content-height); the rail itself is NOT
            individually sticky, so the "Add optional missions" box below it
            can't be overlapped/clipped (FIX 1). */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-[22px] lg:self-start">
          <MissionRail
            steps={railSteps}
            checked={railChecked}
            railTag={mission.railTag}
            activeIndex={activeIndex}
            onSelect={onRailSelect}
            disabledIndices={disabledIndices}
            sections={railSections}
            sticky={false}
          />
          {(() => {
            const memoryStarted = startedLevels.has("memory");
            const toolsStarted = startedLevels.has("tools");
            // Actionable = can still be added (not wanted yet) or removed
            // (wanted, but its Level hasn't been started — nothing to lose).
            const knowledgeActionable = !wantsKnowledge || !memoryStarted;
            const toolsActionable = !wantsTools || !toolsStarted;
            if (!knowledgeActionable && !toolsActionable) return null;
            return (
              <div
                className="rounded-2xl border border-line p-4"
                style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
              >
                <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[.13em] text-mute">
                  Optional missions
                </div>
                <div className="flex flex-col gap-2">
                  {!wantsKnowledge && (
                    <button
                      type="button"
                      onClick={() => {
                        setWantsKnowledge(true);
                        goToMission("retrieval");
                      }}
                      className="rounded-lg border border-line px-3 py-2 text-left font-mono text-[11px] text-text transition-colors hover:border-violet hover:text-violet-hi"
                    >
                      📚 + Add Memory (knowledge)
                    </button>
                  )}
                  {wantsKnowledge && !memoryStarted && (
                    <button
                      type="button"
                      onClick={() => {
                        setWantsKnowledge(false);
                        if (levelForMission(current).id === "memory") goToMission("identity");
                      }}
                      className="rounded-lg border border-line px-3 py-2 text-left font-mono text-[11px] text-mute transition-colors hover:border-rose hover:text-rose"
                    >
                      📚 − Remove Memory (knowledge)
                    </button>
                  )}
                  {!wantsTools && (
                    <button
                      type="button"
                      onClick={() => {
                        setWantsTools(true);
                        goToMission("toolDefine");
                      }}
                      className="rounded-lg border border-line px-3 py-2 text-left font-mono text-[11px] text-text transition-colors hover:border-violet hover:text-violet-hi"
                    >
                      🔧 + Add Tools
                    </button>
                  )}
                  {wantsTools && !toolsStarted && (
                    <button
                      type="button"
                      onClick={() => {
                        setWantsTools(false);
                        if (levelForMission(current).id === "tools") goToMission("identity");
                      }}
                      className="rounded-lg border border-line px-3 py-2 text-left font-mono text-[11px] text-mute transition-colors hover:border-rose hover:text-rose"
                    >
                      🔧 − Remove Tools
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* CENTER — Situation Report + editor + code + console */}
        <div
          className="rounded-2xl border border-line p-[26px]"
          style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
        >
          {/* Shared mission header — crumb (with level), Situation Report, chips */}
          <div className="mb-[18px] font-mono text-[11px] tracking-[.02em] text-mute">
            <b className="font-semibold text-violet-hi">Freeform</b>
            <span className="mx-2 text-line-2">/</span>
            Level {levelNumber} · {currentLevel.title}
            <span className="mx-2 text-line-2">/</span>
            {mission.title}
          </div>

          <div
            className="mb-[18px] rounded-xl border border-line border-l-[3px] border-l-rose p-4"
            style={{
              background:
                "linear-gradient(135deg, rgba(var(--color-rose-rgb)/.08), rgba(var(--color-violet-rgb)/.05))",
            }}
          >
            <div className="mb-2 flex items-center gap-[7px] font-mono text-[9.5px] uppercase tracking-[.15em] text-rose">
              Situation report
            </div>
            <p
              className="text-[13px] leading-[1.55] text-dim [&_b]:text-text [&_code]:rounded [&_code]:bg-panel-3 [&_code]:px-1 [&_code]:font-mono [&_code]:text-plasma"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: mission.sitrepHtml }}
            />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-[rgba(var(--color-violet-rgb)/.35)] bg-panel-2 px-[11px] py-[5px] font-mono text-[11px] text-violet-hi">
              +{mission.reward} XP
            </span>
            <span className="rounded-full border border-[rgba(var(--color-amber-rgb)/.3)] bg-panel-2 px-[11px] py-[5px] font-mono text-[11px] text-amber">
              Difficulty · {MISSION_META[mission.key].difficulty}
            </span>
            <span className="rounded-full border border-line bg-panel-2 px-[11px] py-[5px] font-mono text-[11px] text-dim">
              ~{MISSION_META[mission.key].estimateMin} min
            </span>
            {mission.optional && (
              <span className="rounded-full border border-line bg-panel-2 px-[11px] py-[5px] font-mono text-[11px] text-dim">
                optional
              </span>
            )}
          </div>

          {/* Mission body: Ship + Upload are real action missions with their
              own completion triggers; every other mission uses the inline
              code editor + real console/gating. */}
          {current === "ship" ? (
            <ShipPhase
              draft={draft}
              created={created}
              shipping={shipping}
              shipError={shipError}
              notConfigured={notConfigured}
              canShip={canShip}
              onShip={ship}
              onShipAnother={shipAnother}
              onGoToUpload={missions.some((m) => m.key === "upload") ? () => goToMission("upload") : undefined}
              missionsCompleted={completed.size}
              missionsTotal={missions.length}
              crewNext={crewNext}
              onBack={created ? undefined : () => setView("overview")}
            />
          ) : current === "upload" ? (
            <UploadPhase
              agent={created}
              sessionId={sessionIdRef.current}
              done={completed.has("upload")}
              onFinish={() => awardMission(getMission("upload"))}
              onShipAnother={shipAnother}
              crewNext={crewNext}
              onBack={completed.has("upload") ? undefined : () => setView("overview")}
            />
          ) : (
            <>
              <CodePanel
                draft={draft}
                update={update}
                rawTemp={rawTemp}
                rawTopK={rawTopK}
                onNumericChange={onNumericChange}
                onFieldEdit={onFieldEdit}
                slotState={slotState}
                defaultFile={defaultFile}
                hints={hints}
                isFieldUnlocked={isFieldUnlocked}
                extraFiles={extraCodeFiles}
              />

              <div className="mt-4 overflow-hidden rounded-xl border border-line">
                <ConsolePanel fileName={defaultFile} lines={consoleLog} blocking={blocking} passed={passed} />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3.5">
                <span className="font-mono text-xs text-mute">
                  <b className="text-spring">{passed}</b> checks passed
                  {blocking > 0 && (
                    <>
                      {" · "}
                      <b className="text-amber">{blocking}</b> blocking
                    </>
                  )}
                </span>
                <div className="flex items-center gap-2.5">
                  {/* Chain-symmetric: every mission's editor is preceded by
                      that same mission's own overview screen, so Back always
                      has somewhere real to go (unlike Continue, which is
                      blocked on validation, not on being the first mission). */}
                  <button
                    type="button"
                    onClick={() => setView("overview")}
                    className="rounded-[10px] border border-line px-5 py-3 text-sm font-semibold text-dim transition-all hover:-translate-y-0.5 hover:border-violet hover:text-violet-hi"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    disabled={blocking > 0}
                    onClick={() => completeMission(mission)}
                    className={`rounded-[10px] px-[26px] py-3 text-sm font-semibold transition-all ${
                      blocking === 0
                        ? "cursor-pointer text-on-accent hover:-translate-y-0.5"
                        : "cursor-not-allowed border border-line bg-panel-3 text-mute"
                    }`}
                    style={
                      blocking === 0
                        ? {
                            background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
                            boxShadow: "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)",
                          }
                        : undefined
                    }
                  >
                    {isLastMission ? "Finish →" : "Continue →"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT — Live Agent diagram + Trade-offs/Pitfalls/Docs */}
        <div className="flex flex-col gap-4">
          <LiveBlueprint
            blueprint={bp}
            litMap={bpState.litMap}
            valueMap={bpState.valueMap}
            wireMap={bpState.wireMap}
            tempOn={bpState.tempOn}
            tempVal={bpState.tempVal}
            bpLive={bpState.bpLive}
            bpStatusText={bpState.bpStatusText}
            bpCaption={bpState.bpCaption}
          />
          <AssistantTabs tabs={ASSISTANT_TABS} active={assistantTab} onChange={setAssistantTab} />
        </div>
      </div>
    </div>
  );
}

/** Level 4 · Upload Your Knowledge — the real post-ship upload flow. Reuses
 * the existing KnowledgeUploadForm (no new upload logic); it just lives in
 * this mission's slot now. Only ever rendered once `agent` exists. */
function UploadPhase({
  agent,
  sessionId,
  done,
  onFinish,
  onShipAnother,
  crewNext,
  onBack,
}: {
  agent: ApiForgedAgent | null;
  sessionId: string;
  done: boolean;
  onFinish: () => void;
  onShipAnother: () => void;
  crewNext?: { label: string; onContinue: () => void };
  /** Back to Upload's own overview screen — undefined once the build is
   * actually finished (nothing left to revise). */
  onBack?: () => void;
}) {
  if (!agent) {
    return (
      <p className="font-mono text-[12px] text-mute">
        🔒 This mission unlocks after Ship — the Qdrant collection is named{" "}
        <code className="text-plasma">agent_&lt;id&gt;</code>, which only exists once the real agent
        is created.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-line bg-code-bg p-4">
        <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[.1em] text-mute">
          Add documents to {agent.name}
        </div>
        <KnowledgeUploadForm agentId={agent.lyzrAgentId} />
      </div>

      <div className="rounded-xl border border-line bg-code-bg p-4">
        <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[.1em] text-mute">
          Test retrieval
        </div>
        <TestConsole agentId={agent.lyzrAgentId} sessionId={sessionId} />
      </div>

      {done ? (
        <div className="flex flex-col gap-4">
          <span className="font-mono text-[11.5px] text-spring">✓ Build complete — every level done.</span>

          {/* Same real 5-link hub the Ship mission shows — this mission is
              the actual last step whenever Knowledge is opted in, so the
              hub had disappeared for anyone who reached Ship earlier and
              navigated on into Upload (a real, reported gap: the hub only
              ever lived on the Ship mission's own screen). */}
          <div className="grid grid-cols-2 gap-3">
            <HubLink href={`/agent/${agent.id}/doc`} icon="📄" label="View what you learned" />
            <HubLink href={`/agent/${agent.id}/chat`} icon="💬" label="Talk to Agent" />
            <HubLink href={`/agent/${agent.id}/arena`} icon="⚔️" label="Red Team Arena" />
            <HubLink href={`/agent/${agent.id}/compare`} icon="🧬" label="Multiverse Compare" />
            <HubLink href={`/agent/${agent.id}/certificate`} icon="🏅" label="Generate Forge Certificate" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {crewNext ? (
              <button
                type="button"
                onClick={crewNext.onContinue}
                className="rounded-lg px-4 py-2 font-mono text-xs font-semibold text-on-accent transition-all hover:-translate-y-0.5"
                style={{
                  background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
                  boxShadow: "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)",
                }}
              >
                {crewNext.label}
              </button>
            ) : (
              <button
                type="button"
                onClick={onShipAnother}
                className="rounded-lg border border-line px-4 py-2 font-mono text-xs text-text transition-colors hover:border-violet hover:text-violet-hi"
              >
                + Ship another agent
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-[10px] border border-line px-5 py-3 text-sm font-semibold text-dim transition-all hover:-translate-y-0.5 hover:border-violet hover:text-violet-hi"
            >
              ← Back
            </button>
          )}
          <button
            type="button"
            onClick={onFinish}
            className="self-start rounded-[10px] px-7 py-3 text-sm font-semibold text-on-accent transition-all hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
              boxShadow: "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)",
            }}
          >
            Finish build →
          </button>
        </div>
      )}
    </div>
  );
}

function ShipPhase({
  draft,
  created,
  shipping,
  shipError,
  notConfigured,
  canShip,
  onShip,
  onShipAnother,
  onGoToUpload,
  missionsCompleted,
  missionsTotal,
  crewNext,
  onBack,
}: {
  draft: AgentDraft;
  created: ApiForgedAgent | null;
  shipping: boolean;
  shipError: string | null;
  notConfigured: boolean;
  canShip: boolean;
  onShip: () => void;
  onShipAnother: () => void;
  /** Jump straight to the Upload mission — undefined when it isn't part of
   * this build's active mission list. */
  onGoToUpload?: () => void;
  /** Real counts, not fabricated — completed.size / missions.length at the
   * moment Ship renders (Ship itself is already counted as completed here). */
  missionsCompleted: number;
  missionsTotal: number;
  /** Back to the mission right before Ship — undefined once shipped (a real
   * agent already exists, so there's nothing left to "go back" out of). */
  onBack?: () => void;
  crewNext?: { label: string; onContinue: () => void };
}) {
  const missing = useMemo(() => {
    const items: string[] = [];
    if (!draft.name.trim()) items.push("name");
    if (!draft.role.trim()) items.push("role");
    if (!draft.goal.trim()) items.push("goal");
    if (!draft.instructions.trim()) items.push("instructions");
    return items;
  }, [draft]);

  if (created) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[.13em] text-spring">
            ✓ Shipped
          </div>
          <h2 className="font-display text-lg font-semibold">{created.name} is live on Lyzr</h2>
          <p className="mt-1 font-mono text-[11.5px] text-mute">
            agent_id {created.lyzrAgentId} · forge score {created.forgeScore}/100
          </p>
        </div>

        {/* Real values off the persisted forged_agents row — forgeTime/
            xpEarned are exactly what ship() sent the backend, and
            missionsCompleted/Total come from the same completed/missions
            state the Build Map itself renders from. Nothing here is
            fabricated (CLAUDE.md hard rule #1) — no stand-in "backlog"
            metric, since freeform agents have no fixed business narrative
            to invent one for. */}
        <div className="grid grid-cols-3 gap-3">
          <StatBig value={formatBuildTime(created.forgeTime)} label="build time" color="text-spring" />
          <StatBig value={String(created.xpEarned)} label="XP earned" color="text-violet-hi" />
          <StatBig value={`${missionsCompleted}/${missionsTotal}`} label="missions" color="text-plasma" />
        </div>

        {/* Knowledge upload now lives in its own Upload mission (Level 4),
            reachable only after this agent_id exists. The five links below
            route to the same real screens a campaign ship already used —
            adapted (§ freeformAgentView.ts) to read this agent's real
            config instead of a campaign's, not rebuilt. View was missing
            here despite existing on both the campaign ship hub and the
            /campaigns card grid — added for parity. */}
        <div className="grid grid-cols-2 gap-3">
          <HubLink href={`/agent/${created.id}/doc`} icon="📄" label="View what you learned" />
          <HubLink href={`/agent/${created.id}/chat`} icon="💬" label="Talk to Agent" />
          <HubLink href={`/agent/${created.id}/arena`} icon="⚔️" label="Red Team Arena" />
          <HubLink href={`/agent/${created.id}/compare`} icon="🧬" label="Multiverse Compare" />
          <HubLink href={`/agent/${created.id}/certificate`} icon="🏅" label="Generate Forge Certificate" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onGoToUpload && (
            <button
              type="button"
              onClick={onGoToUpload}
              className="rounded-lg px-4 py-2 font-mono text-xs font-semibold text-on-accent transition-all hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
                boxShadow: "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)",
              }}
            >
              📚 Add knowledge →
            </button>
          )}
          {crewNext ? (
            <button
              type="button"
              onClick={crewNext.onContinue}
              className="rounded-lg px-4 py-2 font-mono text-xs font-semibold text-on-accent transition-all hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
                boxShadow: "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)",
              }}
            >
              {crewNext.label}
            </button>
          ) : (
            <button
              type="button"
              onClick={onShipAnother}
              className="rounded-lg border border-line px-4 py-2 font-mono text-xs text-text transition-colors hover:border-violet hover:text-violet-hi"
            >
              + Ship another agent
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[.13em] text-mute">Ship</div>
        <h2 className="font-display text-lg font-semibold">Review, then create the real Lyzr agent</h2>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-code-bg p-4 font-mono text-[12.5px]">
        <Row label="name" value={draft.name || "—"} />
        <Row label="role" value={draft.role || "(defaults to customer support assistant)"} />
        <Row label="goal" value={draft.goal || "(defaults to Answer customer questions using retrieved docs)"} />
        <Row label="model" value={`${draft.model} (${draft.provider})`} />
        <Row label="temperature" value={draft.temperature.toFixed(2)} />
        <Row label="instructions" value={draft.instructions ? `${draft.instructions.length} chars` : "—"} />
        <Row
          label="tools"
          value={(draft.tools?.length ?? 0) > 0 ? draft.tools!.map((t) => t.name).join(", ") : "none"}
        />
      </div>

      {missing.length > 0 && (
        <p className="font-mono text-[11.5px] text-amber">⚠ Fill in {missing.join(", ")} before shipping.</p>
      )}
      {notConfigured && <p className="font-mono text-[11.5px] text-amber">⚠ {shipError}</p>}
      {!notConfigured && shipError && <p className="font-mono text-[11.5px] text-rose">⚠ {shipError}</p>}

      <div className="flex items-center gap-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={shipping}
            className="rounded-[10px] border border-line px-5 py-3 text-sm font-semibold text-dim transition-all hover:-translate-y-0.5 hover:border-violet hover:text-violet-hi disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            ← Back
          </button>
        )}
        <button
          type="button"
          onClick={onShip}
          disabled={!canShip || shipping}
          className="self-start rounded-[10px] px-7 py-3 text-sm font-semibold text-on-accent transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          style={{
            background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
            boxShadow: "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)",
          }}
        >
          {shipping ? "⏳ Shipping…" : "🚀 Ship agent"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-mute">{label}</span>
      <span className="text-right text-text">{value}</span>
    </div>
  );
}

function formatBuildTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function StatBig({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-line bg-code-bg py-4">
      <span className={`font-display text-xl font-semibold ${color}`}>{value}</span>
      <span className="font-mono text-[9.5px] uppercase tracking-[.1em] text-mute">{label}</span>
    </div>
  );
}

function HubLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className="rounded-lg border border-line px-4 py-3 text-left font-mono text-[12px] text-text transition-colors hover:border-violet hover:text-violet-hi"
    >
      {icon} {label}
    </button>
  );
}
