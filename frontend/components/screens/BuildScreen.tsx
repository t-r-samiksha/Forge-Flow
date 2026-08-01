"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/lib/store";
import { getCampaign, type Mission, type SlotDef } from "@/lib/campaigns";
import { lint } from "@/lib/lint";
import { confettiBurst, showToast, spawnXpFly } from "@/lib/effects";
import { saveProgress } from "@/lib/api";
import { getUserId } from "@/lib/session";

function slotDefsFor(mission: Mission): SlotDef[] {
  return mission.code
    .flatMap((line) => line.parts)
    .map((p) => p.slot)
    .filter((s): s is SlotDef => !!s);
}
import MissionIntro from "@/components/build/MissionIntro";
import MissionRail from "@/components/build/MissionRail";
import CodeEditor from "@/components/build/CodeEditor";
import ConsolePanel, { type ConsoleLine } from "@/components/build/ConsolePanel";
import LiveBlueprint from "@/components/build/LiveBlueprint";
import AssistantTabs from "@/components/build/AssistantTabs";

/** Generic blueprint runtime state — driven entirely by each campaign's
 * data (SlotDef.litNodeIds/litWireIds/valueNodeId/formatValue,
 * Mission.convergeNodeId/captionIncomplete/captionComplete/
 * carryForward), so a second campaign with a differently-shaped
 * blueprint doesn't need any new BuildScreen code. */
interface BuildBlueprintState {
  lit: Record<string, boolean>;
  wireOn: Record<string, boolean>;
  values: Record<string, string>;
  tempOn: boolean;
  tempVal: string;
  bpLive: boolean;
  bpStatusText: string;
  bpCaption: string;
}

function baseBlueprintState(captionIncomplete: string): BuildBlueprintState {
  return {
    lit: {},
    wireOn: {},
    values: {},
    tempOn: false,
    tempVal: "temp —",
    bpLive: false,
    bpStatusText: "assembling",
    bpCaption: captionIncomplete,
  };
}

let consoleLineId = 0;

export default function BuildScreen({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const addXp = useGameStore((s) => s.addXp);
  const setGlobalSlot = useGameStore((s) => s.setSlot);
  const completeMission = useGameStore((s) => s.completeMission);
  const setActiveContext = useGameStore((s) => s.setActiveContext);
  const unlockAchievements = useGameStore((s) => s.unlockAchievements);
  const progressLoaded = useGameStore((s) => s.progressLoaded);
  const storeActiveCampaignId = useGameStore((s) => s.activeCampaignId);
  const storeMissionIndex = useGameStore((s) => s.currentMissionIndex);
  const startCampaignBuild = useGameStore((s) => s.startCampaignBuild);
  const bumpTimerSeconds = useGameStore((s) => s.bumpTimerSeconds);

  const [missionIdx, setMissionIdx] = useState(0);
  const [slotValues, setSlotValues] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<boolean[]>([]);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [bp, setBp] = useState<BuildBlueprintState>(() => baseBlueprintState(""));
  const [advancing, setAdvancing] = useState(false);
  const [buildReady, setBuildReady] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  const lintTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const continueBtnRef = useRef<HTMLButtonElement>(null);
  const encouragementFired = useRef<Set<"first" | "half" | "all">>(new Set());
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const campaign = getCampaign(campaignId)!;
  const missions = campaign.missions;
  const mission = missions[missionIdx]!;

  // Decide once, after progress has loaded, whether this campaign already
  // has an in-progress build to resume into (same campaignId as the
  // store's activeCampaignId) or should start clean at mission 0.
  useEffect(() => {
    if (!progressLoaded || buildReady) return;
    if (storeActiveCampaignId === campaignId) {
      const resumeIdx = Math.min(storeMissionIndex, missions.length - 1);
      setMissionIdx(resumeIdx);
      const hasProgress = resumeIdx > 0 || Object.keys(useGameStore.getState().slotValues).length > 0;
      if (hasProgress) {
        showToast("↺", `Resumed — Mission ${resumeIdx + 1} of ${missions.length}`);
      }
      const pending = useGameStore.getState().pendingBuildTimerSeconds;
      if (pending > 0) bumpTimerSeconds(pending);
    } else {
      startCampaignBuild(campaignId);
      setMissionIdx(0);
    }
    setBuildReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressLoaded, buildReady, campaignId, missions.length]);

  useEffect(() => {
    setActiveContext(`${campaign.title} — ${mission.title}`);
    return () => setActiveContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.title, campaign.title]);

  useEffect(() => () => clearTimeout(autosaveTimer.current), []);

  useEffect(() => {
    setShowIntro(true);
    setConsoleLines([]);
    setActiveTab(0);
    encouragementFired.current.clear();

    // Rehydrate this mission's slots from whatever the store already has
    // saved for these node keys (empty on a fresh build, populated when
    // resuming) instead of always starting blank.
    const savedNodeValues = useGameStore.getState().slotValues;
    const defs = slotDefsFor(mission);
    const initialLocal: Record<number, string> = {};
    const initialChecked: boolean[] = mission.checklist.map(() => false);
    for (const slot of defs) {
      const saved = savedNodeValues[slot.node];
      if (saved === undefined) continue;
      const res = lint(slot.node, saved.trim());
      const passes = saved.trim().length > 0 && res.ok !== false;
      initialLocal[slot.index] = saved;
      initialChecked[slot.index] = passes;
    }
    setSlotValues(initialLocal);
    setChecked(initialChecked);

    const cf = mission.carryForward;
    const next: BuildBlueprintState = {
      lit: { ...cf?.lit },
      wireOn: { ...cf?.wireOn },
      values: { ...cf?.values },
      tempOn: cf?.tempOn ?? false,
      tempVal: cf?.tempVal ?? "temp —",
      bpLive: false,
      bpStatusText: "assembling",
      bpCaption: mission.captionIncomplete,
    };
    // Fold in whatever's already resolved for this mission on resume, so
    // the blueprint doesn't visually reset to "nothing filled yet".
    for (const slot of defs) {
      const saved = savedNodeValues[slot.node];
      if (saved === undefined) continue;
      const passes = initialChecked[slot.index];
      for (const id of slot.litNodeIds ?? []) next.lit[id] = passes;
      for (const id of slot.litWireIds ?? []) next.wireOn[id] = passes;
      if (slot.valueNodeId) {
        next.values[slot.valueNodeId] = passes
          ? slot.formatValue
            ? slot.formatValue(saved)
            : saved
          : "—";
      }
      if (slot.node === "temp") {
        next.tempOn = passes;
        next.tempVal = passes ? `temp ${saved}` : "temp —";
      }
    }
    const missionComplete = initialChecked.length > 0 && initialChecked.every(Boolean);
    if (mission.convergeNodeId) next.lit[mission.convergeNodeId] = missionComplete;
    next.bpCaption = missionComplete ? mission.captionComplete : mission.captionIncomplete;
    if (missionIdx === missions.length - 1) {
      next.bpLive = missionComplete;
      next.bpStatusText = missionComplete ? "ready to run" : "assembling";
    }
    setBp(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionIdx]);

  const blocking = checked.filter((c) => !c).length;
  const passed = checked.filter(Boolean).length;
  const allChecked = checked.length > 0 && checked.every(Boolean);

  const handleSlotChange = (slot: SlotDef, rawVal: string) => {
    const val = rawVal.trim();
    const res = lint(slot.node, val);
    const passes = val.length > 0 && res.ok !== false;

    setSlotValues((prev) => ({ ...prev, [slot.index]: rawVal }));
    if (passes) setGlobalSlot(slot.node, rawVal);
    setChecked((prev) => {
      const next = [...prev];
      next[slot.index] = passes;
      return next;
    });

    if (passes) {
      const willBeChecked = [...checked];
      willBeChecked[slot.index] = true;
      const passedCount = willBeChecked.filter(Boolean).length;
      const total = willBeChecked.length;
      const fired = encouragementFired.current;

      if (passedCount === 1 && !fired.has("first")) {
        fired.add("first");
        showToast("⚡", "First decision made");
      } else if (
        total > 2 &&
        passedCount === Math.ceil(total / 2) &&
        !fired.has("half")
      ) {
        fired.add("half");
        showToast("🎯", "Halfway there");
      } else if (passedCount === total && total > 1 && !fired.has("all")) {
        fired.add("all");
        showToast("🚀", "All systems go — ready to continue");
      }
    }

    setBp((prev) => {
      const next: BuildBlueprintState = {
        lit: { ...prev.lit },
        wireOn: { ...prev.wireOn },
        values: { ...prev.values },
        tempOn: prev.tempOn,
        tempVal: prev.tempVal,
        bpLive: prev.bpLive,
        bpStatusText: prev.bpStatusText,
        bpCaption: prev.bpCaption,
      };

      for (const id of slot.litNodeIds ?? []) next.lit[id] = passes;
      for (const id of slot.litWireIds ?? []) next.wireOn[id] = passes;
      if (slot.valueNodeId) {
        next.values[slot.valueNodeId] = passes
          ? slot.formatValue
            ? slot.formatValue(rawVal)
            : rawVal
          : "—";
      }
      // "temp" is a decoration on a node (Retriever's temp-pill), not a
      // standalone node — campaigns without a temp-like slot never hit this.
      if (slot.node === "temp") {
        next.tempOn = passes;
        next.tempVal = passes ? `temp ${rawVal}` : "temp —";
      }

      const willBeChecked = [...checked];
      willBeChecked[slot.index] = passes;
      const missionComplete = willBeChecked.length > 0 && willBeChecked.every(Boolean);

      if (mission.convergeNodeId) {
        next.lit[mission.convergeNodeId] = missionComplete;
      }
      next.bpCaption = missionComplete ? mission.captionComplete : mission.captionIncomplete;

      if (missionIdx === missions.length - 1) {
        next.bpLive = missionComplete;
        next.bpStatusText = missionComplete ? "ready to run" : "assembling";
      }

      return next;
    });

    clearTimeout(lintTimers.current[slot.node]);
    if (val.length > 0) {
      lintTimers.current[slot.node] = setTimeout(() => {
        setConsoleLines((prev) => [
          ...prev,
          {
            id: consoleLineId++,
            type: res.ok === false ? "warn" : res.warn ? "warn" : "ok",
            icon: res.icon,
            msg: res.msg,
            loc: res.loc,
          },
        ]);
      }, 420);
    }

    // Debounced checkpoint so a mid-mission tab close doesn't lose slots
    // filled since the last mission-boundary save.
    clearTimeout(autosaveTimer.current);
    if (passes) {
      autosaveTimer.current = setTimeout(() => {
        const state = useGameStore.getState();
        saveProgress(getUserId(), {
          activeCampaignId: campaignId,
          currentMissionIndex: missionIdx,
          slotValues: state.slotValues,
          buildTimerSeconds: state.timerSeconds,
        }).catch(() => {
          /* non-blocking — best-effort checkpoint */
        });
      }, 1200);
    }
  };

  const handleContinue = () => {
    if (!allChecked || advancing) return;
    setAdvancing(true);

    if (continueBtnRef.current) {
      spawnXpFly(continueBtnRef.current, `+${mission.reward}`);
    }
    addXp(mission.reward);
    completeMission(mission.key);
    showToast(`+${mission.reward} XP`, `Mission ${missionIdx + 1} complete`);
    confettiBurst(16);

    clearTimeout(autosaveTimer.current);
    const state = useGameStore.getState();
    saveProgress(getUserId(), {
      xp: state.xp,
      streak: state.streak,
      completedMissions: state.completedMissions,
      unlockedCampaigns: state.unlockedCampaigns,
      activeCampaignId: campaignId,
      currentMissionIndex: missionIdx + 1,
      slotValues: state.slotValues,
      buildTimerSeconds: state.timerSeconds,
    })
      .then((progress) => {
        if (progress.newAchievements?.length) unlockAchievements(progress.newAchievements);
      })
      .catch(() => {
        /* non-blocking — local state already updated, will sync next successful call */
      });

    if (missionIdx < missions.length - 1) {
      setTimeout(() => {
        setMissionIdx((i) => i + 1);
        setAdvancing(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 420);
    } else {
      setBp((prev) => ({
        ...prev,
        lit: { ...prev.lit, [campaign.blueprint.finalNodeId]: true },
        wireOn: { ...prev.wireOn, [campaign.blueprint.finalWireId]: true },
      }));
      setTimeout(() => {
        router.push(`/ship/${campaignId}`);
      }, 700);
    }
  };

  const crumb = useMemo(
    () => (
      <div className="mb-[18px] font-mono text-[11px] tracking-[.02em] text-mute">
        <b className="font-semibold text-violet-hi">{campaign.title}</b>
        <span className="mx-2 text-line-2">/</span>
        Mission {missionIdx + 1} of {missions.length}
        <span className="mx-2 text-line-2">/</span>
        {mission.title}
      </div>
    ),
    [missionIdx, mission.title, campaign.title]
  );

  if (!buildReady) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-24 text-center">
        <p className="text-sm text-dim">Loading your progress…</p>
      </div>
    );
  }

  if (showIntro) {
    return (
      <MissionIntro
        mission={mission}
        missionNumber={missionIdx + 1}
        totalMissions={missions.length}
        onBegin={() => setShowIntro(false)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-10">
      {crumb}
      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[206px_1fr_344px]">
        <MissionRail steps={mission.steps} checked={checked} railTag={mission.railTag} />

        <div
          className="rounded-2xl border border-line p-[26px]"
          style={{ background: "linear-gradient(180deg, var(--color-panel), var(--color-panel-2))" }}
        >
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
              className="text-[13px] leading-[1.55] text-dim [&_b]:text-text"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: mission.sitrepHtml }}
            />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-[rgba(var(--color-violet-rgb)/.35)] bg-panel-2 px-[11px] py-[5px] font-mono text-[11px] text-violet-hi">
              +{mission.reward} XP
            </span>
            <span className="rounded-full border border-[rgba(var(--color-amber-rgb)/.3)] bg-panel-2 px-[11px] py-[5px] font-mono text-[11px] text-amber">
              Difficulty · {mission.difficulty}
            </span>
            <span className="rounded-full border border-line bg-panel-2 px-[11px] py-[5px] font-mono text-[11px] text-dim">
              ~{mission.estimateMin} min
            </span>
          </div>

          <h2 className="mb-2 font-display text-[23px] font-semibold tracking-[-.01em]">
            {mission.title}
          </h2>
          <p
            className="mb-5 text-[13.5px] leading-[1.6] text-dim [&_code]:rounded [&_code]:bg-panel-3 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-plasma [&_em]:not-italic [&_em]:text-violet-hi"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: mission.descHtml }}
          />

          <CodeEditor
            mission={mission}
            slotValues={slotValues}
            checked={checked}
            onSlotChange={handleSlotChange}
          />
          <ConsolePanel
            fileName={mission.file}
            lines={consoleLines}
            blocking={blocking}
            passed={passed}
          />

          <div className="mt-4 flex items-center justify-between gap-3.5">
            <span className="font-mono text-xs text-mute">
              <b className="text-spring">{passed}</b> / {checked.length} slots verified
            </span>
            <button
              ref={continueBtnRef}
              type="button"
              disabled={!allChecked || advancing}
              onClick={handleContinue}
              className={`rounded-[10px] px-[26px] py-3 text-sm font-semibold transition-all ${
                allChecked && !advancing
                  ? "-translate-y-0 cursor-pointer text-on-accent hover:-translate-y-0.5"
                  : "cursor-not-allowed border border-line bg-panel-3 text-mute"
              }`}
              style={
                allChecked && !advancing
                  ? {
                      background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
                      boxShadow: "0 8px 28px -8px rgba(var(--color-violet-rgb)/.75)",
                    }
                  : undefined
              }
            >
              {missionIdx === missions.length - 1 ? "Ship the agent →" : "Continue →"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <LiveBlueprint
            blueprint={campaign.blueprint}
            litMap={bp.lit}
            valueMap={bp.values}
            wireMap={bp.wireOn}
            tempOn={bp.tempOn}
            tempVal={bp.tempVal}
            bpLive={bp.bpLive}
            bpStatusText={bp.bpStatusText}
            bpCaption={bp.bpCaption}
          />
          <AssistantTabs tabs={mission.tabs} active={activeTab} onChange={setActiveTab} />
        </div>
      </div>
    </div>
  );
}
