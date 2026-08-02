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
import { getTemplate } from "@/lib/agentTemplates";
import {
  blankDraft,
  weatherToolPreset,
  BUILTIN_WEATHER,
  type AgentDraft,
  type ParamType,
  type ToolDef,
} from "@/lib/types";
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
import CodePanel, { type FileName, type SlotState } from "@/components/freeform/CodePanel";
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
}
const FREEFORM_SNAPSHOT_KEY = "__freeform";

export default function FreeformBuildScreen({ templateId }: { templateId?: string }) {
  const router = useRouter();
  const addXp = useGameStore((s) => s.addXp);

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
    : null;
  const [wantsKnowledge, setWantsKnowledge] = useState(false);
  const [wantsTools, setWantsTools] = useState(
    () => (getTemplate(templateId)?.tools?.length ?? 0) > 0
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
  // A `?template=` entry is an explicit "start fresh from this template"
  // action, so it skips the resume check entirely rather than silently
  // discarding or fighting over a different in-progress draft.
  useEffect(() => {
    if (templateId) {
      setResumeChecked(true);
      return;
    }
    getProgress(getUserId())
      .then((progress) => {
        const raw = progress.activeCampaignId === "freeform" ? progress.slotValues[FREEFORM_SNAPSHOT_KEY] : undefined;
        if (raw) {
          try {
            const snap = JSON.parse(raw) as FreeformSnapshot;
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

  /** Debounced, backend-persisted autosave — fires on every field edit and
   * at mission-navigation checkpoints, matching how the campaign build
   * flow autosaves on every slot fill. No-ops once shipped: `ship()`
   * already clears this same record server-side (see backend agent.ts),
   * so there is nothing left to resume into. */
  const scheduleAutosave = () => {
    if (createdRef.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
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
      };
      saveProgress(getUserId(), {
        activeCampaignId: "freeform",
        currentMissionIndex: 0,
        slotValues: { [FREEFORM_SNAPSHOT_KEY]: JSON.stringify(snap) },
        buildTimerSeconds: 0,
      }).catch(() => {
        /* non-blocking — worst case this edit isn't resumable, nothing else breaks */
      });
    }, 900);
  };

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
      });
      setCreated(result);
      createdRef.current = result;
      clearTimeout(saveTimer.current);
      showToast("🚀", "Agent shipped — a real Lyzr agent is live.");
      // Ship is a real mission — award its XP now that the agent exists.
      awardMission(getMission("ship"));
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

  const backLink = (
    <div className="mx-auto max-w-[720px] px-6 pt-10">
      <button type="button" className="back-link" onClick={() => router.push("/campaigns")}>
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

  // ---- Level-intro pre-screen (reuses MissionIntro; shown once per level
  //      before that level's first mission overview) ----
  if (view === "level") {
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
        />
      </div>
    );
  }

  // ---- mission-overview pre-screen ----
  if (view === "overview") {
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
    <div className="mx-auto max-w-[1400px] px-6 py-10">
      <div className="subnav">
        <button type="button" className="back-link" onClick={() => router.push("/campaigns")}>
          ← back to ForgeFlow
        </button>
        <span className="font-mono text-[11px] text-mute">
          Freeform build{templateId ? ` · from "${templateId}" template` : ""}
        </span>
      </div>

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
          {(!wantsKnowledge || !wantsTools) && (
            <div
              className="rounded-2xl border border-line p-4"
              style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
            >
              <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[.13em] text-mute">
                Add optional missions
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
              </div>
            </div>
          )}
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
            />
          ) : current === "upload" ? (
            <UploadPhase
              agent={created}
              sessionId={sessionIdRef.current}
              done={completed.has("upload")}
              onFinish={() => awardMission(getMission("upload"))}
              onShipAnother={shipAnother}
            />
          ) : (
            <>
              {isToolMission && (
                <div className="mb-5">
                  <ToolsEditor draft={draft} update={update} />
                </div>
              )}

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

interface ParamRow {
  key: string;
  type: ParamType;
}

function ToolsEditor({
  draft,
  update,
}: {
  draft: AgentDraft;
  update: (patch: Partial<AgentDraft>) => void;
}) {
  const tools = draft.tools ?? [];
  const [kind, setKind] = useState<"weather" | "webhook">("weather");
  const [name, setName] = useState("get_weather");
  const [description, setDescription] = useState("Look up the current weather for a city");
  const [endpointUrl, setEndpointUrl] = useState(BUILTIN_WEATHER);
  const [params, setParams] = useState<ParamRow[]>([{ key: "city", type: "string" }]);
  const [formError, setFormError] = useState<string | null>(null);

  const applyKind = (k: "weather" | "webhook") => {
    setKind(k);
    setFormError(null);
    if (k === "weather") {
      const preset = weatherToolPreset();
      setName(preset.name);
      setDescription(preset.description);
      setEndpointUrl(preset.endpointUrl);
      setParams([{ key: "city", type: "string" }]);
    } else {
      setName("");
      setDescription("");
      setEndpointUrl("");
      setParams([{ key: "", type: "string" }]);
    }
  };

  const addTool = () => {
    setFormError(null);
    const cleanName = name.trim();
    if (!/^[a-zA-Z0-9_]+$/.test(cleanName)) {
      setFormError("Tool name must be a snake_case identifier (letters, digits, underscore).");
      return;
    }
    if (tools.some((t) => t.name === cleanName)) {
      setFormError(`A tool named "${cleanName}" is already attached.`);
      return;
    }
    const url = endpointUrl.trim();
    if (kind === "webhook" && !/^https?:\/\//.test(url)) {
      setFormError("Webhook URL must start with http:// or https://.");
      return;
    }
    const paramsSchema: Record<string, ParamType> = {};
    for (const p of params) {
      const k = p.key.trim();
      if (!k) continue;
      paramsSchema[k] = p.type;
    }
    const tool: ToolDef = {
      name: cleanName,
      description: description.trim(),
      paramsSchema,
      endpointUrl: kind === "weather" ? BUILTIN_WEATHER : url,
    };
    update({ tools: [...tools, tool] });
    applyKind("weather");
  };

  const removeTool = (toolName: string) => {
    update({ tools: tools.filter((t) => t.name !== toolName) });
  };

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-lg font-semibold">Give it something real to call</h2>

      {tools.length > 0 && (
        <div className="flex flex-col gap-2">
          {tools.map((t) => (
            <div
              key={t.name}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-code-bg px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-[12.5px] text-text">
                  {t.name}
                  <span className="ml-2 text-mute">
                    {t.endpointUrl === BUILTIN_WEATHER ? "built-in" : "webhook"}
                  </span>
                </div>
                <div className="truncate font-mono text-[10.5px] text-mute">
                  {t.description || "—"} · params: {Object.keys(t.paramsSchema).join(", ") || "none"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeTool(t.name)}
                className="flex-none rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-rose transition-colors hover:border-rose"
              >
                🗑 Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-line p-4">
        <div className="mb-3 flex gap-2 font-mono text-[11px]">
          <button
            type="button"
            onClick={() => applyKind("weather")}
            className={`rounded-full border px-3 py-1.5 transition-colors ${
              kind === "weather"
                ? "border-violet bg-[rgba(var(--color-violet-rgb)/.12)] text-violet-hi"
                : "border-line text-mute hover:text-text"
            }`}
          >
            🌦 Built-in: weather
          </button>
          <button
            type="button"
            onClick={() => applyKind("webhook")}
            className={`rounded-full border px-3 py-1.5 transition-colors ${
              kind === "webhook"
                ? "border-violet bg-[rgba(var(--color-violet-rgb)/.12)] text-violet-hi"
                : "border-line text-mute hover:text-text"
            }`}
          >
            🔗 Custom webhook
          </button>
        </div>

        {kind === "weather" && (
          <p className="mb-3 font-mono text-[10.5px] leading-[1.6] text-mute">
            Real, keyless — hits open-meteo&apos;s geocoding + forecast APIs. Fields below are
            editable, but the endpoint stays the built-in weather handler.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <div>
            {fieldLabel("Tool name")}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="get_weather"
              className={inputCls}
            />
          </div>
          <div>
            {fieldLabel("Description")}
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the tool does and when to use it"
              className={inputCls}
            />
            <p className="mt-1 font-mono text-[10px] text-mute">
              The router picks tools from this text — be specific about when to call it.
            </p>
          </div>
          {kind === "webhook" && (
            <div>
              {fieldLabel("Webhook URL")}
              <input
                type="text"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="https://your-service.example.com/hook"
                className={inputCls}
              />
              <p className="mt-1 font-mono text-[10px] text-mute">
                Called with a real POST — the validated args become the JSON body.
              </p>
            </div>
          )}

          <div>
            {fieldLabel("Parameters (key : type)")}
            <div className="flex flex-col gap-2">
              {params.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={p.key}
                    onChange={(e) =>
                      setParams((prev) => prev.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))
                    }
                    placeholder="param name"
                    className={`${inputCls} flex-1`}
                  />
                  <select
                    value={p.type}
                    onChange={(e) =>
                      setParams((prev) =>
                        prev.map((r, j) => (j === i ? { ...r, type: e.target.value as ParamType } : r))
                      )
                    }
                    className="rounded-lg border border-line bg-code-bg px-2 py-2 font-mono text-[12px] text-text outline-none focus:border-violet"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setParams((prev) => prev.filter((_, j) => j !== i))}
                    className="rounded-md border border-line px-2 font-mono text-[12px] text-mute hover:border-rose hover:text-rose"
                    aria-label="remove parameter"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setParams((prev) => [...prev, { key: "", type: "string" }])}
              className="mt-2 rounded-md border border-line px-3 py-1.5 font-mono text-[11px] text-mute transition-colors hover:border-violet hover:text-violet-hi"
            >
              + parameter
            </button>
          </div>

          {formError && <p className="font-mono text-[11.5px] text-rose">⚠ {formError}</p>}

          <button
            type="button"
            onClick={addTool}
            className="self-start rounded-lg bg-violet px-4 py-2 font-mono text-xs font-semibold text-on-accent transition-transform hover:scale-105"
          >
            + Attach tool
          </button>
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
}: {
  agent: ApiForgedAgent | null;
  sessionId: string;
  done: boolean;
  onFinish: () => void;
  onShipAnother: () => void;
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
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[11.5px] text-spring">✓ Build complete — every level done.</span>
          <button
            type="button"
            onClick={onShipAnother}
            className="rounded-lg border border-line px-4 py-2 font-mono text-xs text-text transition-colors hover:border-violet hover:text-violet-hi"
          >
            + Ship another agent
          </button>
        </div>
      ) : (
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
            reachable only after this agent_id exists. The four links below
            route to the same real screens a campaign ship already used —
            adapted (§ freeformAgentView.ts) to read this agent's real
            config instead of a campaign's, not rebuilt. */}
        <div className="grid grid-cols-2 gap-3">
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
          <button
            type="button"
            onClick={onShipAnother}
            className="rounded-lg border border-line px-4 py-2 font-mono text-xs text-text transition-colors hover:border-violet hover:text-violet-hi"
          >
            + Ship another agent
          </button>
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
