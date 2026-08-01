import { create } from "zustand";
import { triggerLevelUp, showToast, confettiBurst } from "./effects";
import { ACHIEVEMENT_DEFS } from "./achievements";

export type Rank = "Recruit" | "Engineer" | "Architect" | "Forgemaster";
export type InspectorMode = "study" | "edit";

export interface ForgedAgent {
  id: string;
  campaignId: string;
  name: string;
  lyzrAgentId: string;
  config: Record<string, string>;
  originalConfig: Record<string, string>;
  lyzrPayload: Record<string, unknown>;
  forgeScore: number;
  forgeTime: number;
  xpEarned: number;
  version: number;
  forgedAt: string;
  lastEditedAt?: string;
}

interface GameState {
  // Boot
  booted: boolean;

  // Identity
  displayName: string | null;

  // Progress
  xp: number;
  rank: Rank;
  completedMissions: string[];
  unlockedCampaigns: string[];
  achievements: string[];
  streak: number;
  timerSeconds: number;
  timerRunning: boolean;
  progressLoaded: boolean;

  // Build state (during guided missions) — activeCampaignId is which
  // campaign currentMissionIndex/slotValues belong to, so a build for a
  // different campaign knows to start fresh instead of resuming stale state.
  activeCampaignId: string | null;
  currentMissionIndex: number;
  slotValues: Record<string, string>;
  /** Seconds already banked against the active build as of the last
   * hydrate, staged for BuildScreen to fold into the live `timerSeconds`
   * exactly once on resume (see bumpTimerSeconds). */
  pendingBuildTimerSeconds: number;

  // Forged agents
  forgedAgents: ForgedAgent[];

  // Documentation notebook (View screen)
  inspectorMode: InspectorMode;
  inspectorDirtySlots: Record<string, string>;

  // Mentor
  mentorOpen: boolean;
  activeContext: string | null;

  // Actions
  setBooted: (booted: boolean) => void;
  setDisplayName: (name: string | null) => void;
  startTimer: () => void;
  setSlot: (key: string, value: string) => void;
  addXp: (amount: number) => void;
  completeMission: (missionKey: string) => void;
  unlockCampaigns: (campaignIds: string[]) => void;
  unlockAchievements: (badgeKeys: string[]) => void;
  hydrateProgress: (progress: {
    displayName: string | null;
    xp: number;
    rank: Rank;
    streak: number;
    completedMissions: string[];
    unlockedCampaigns: string[];
    achievements: string[];
    activeCampaignId: string | null;
    currentMissionIndex: number;
    slotValues: Record<string, string>;
    buildTimerSeconds: number;
  }) => void;
  /** Called on entering a campaign's build screen: resumes in place if
   * this campaign is already the active build, otherwise resets to a
   * clean slate (mission 0, no slots) and claims it as the active build. */
  startCampaignBuild: (campaignId: string) => void;
  /** Called once a campaign is successfully shipped — there's no
   * in-progress build to resume into anymore. Only clears the resume
   * pointer, not slotValues: ShipScreen keeps reading slotValues for the
   * rest of the ship-day session (running the agent, chat source line,
   * etc), and startCampaignBuild already resets them fresh the next
   * time any build actually starts. */
  clearActiveBuild: () => void;
  /** One-time fold-in of a resumed build's previously-banked seconds
   * into the live elapsed counter — not a hydrate-time overwrite, so a
   * stale number never flashes on page load for routes that aren't
   * resuming anything. */
  bumpTimerSeconds: (delta: number) => void;
  tick: () => void;
  toggleMentor: () => void;
  setActiveContext: (context: string | null) => void;
  forgeAgent: (agent: ForgedAgent) => void;
  updateForgedAgent: (id: string, updates: Partial<ForgedAgent>) => void;
  setInspectorSlot: (key: string, value: string) => void;
  toggleInspectorMode: () => void;
  resetInspector: () => void;
}

export const RANK_THRESHOLDS: Record<Rank, number> = {
  Recruit: 0,
  Engineer: 40,
  Architect: 75,
  Forgemaster: 150,
};

function rankForXp(xp: number): Rank {
  if (xp >= RANK_THRESHOLDS.Forgemaster) return "Forgemaster";
  if (xp >= RANK_THRESHOLDS.Architect) return "Architect";
  if (xp >= RANK_THRESHOLDS.Engineer) return "Engineer";
  return "Recruit";
}

export const useGameStore = create<GameState>((set, get) => ({
  booted: false,

  displayName: null,

  xp: 0,
  rank: "Recruit",
  completedMissions: [],
  unlockedCampaigns: ["retriever"],
  achievements: [],
  streak: 0,
  timerSeconds: 0,
  timerRunning: false,
  progressLoaded: false,

  activeCampaignId: null,
  currentMissionIndex: 0,
  slotValues: {},
  pendingBuildTimerSeconds: 0,

  forgedAgents: [],

  inspectorMode: "study",
  inspectorDirtySlots: {},

  mentorOpen: false,
  activeContext: null,

  setBooted: (booted) => set({ booted }),

  setDisplayName: (name) => set({ displayName: name }),

  startTimer: () => set({ timerRunning: true }),

  setSlot: (key, value) =>
    set((state) => ({
      slotValues: { ...state.slotValues, [key]: value },
    })),

  addXp: (amount) =>
    set((state) => {
      const xp = state.xp + amount;
      const rank = rankForXp(xp);
      if (rank !== state.rank && rank !== "Recruit") {
        triggerLevelUp(rank);
      }
      return { xp, rank };
    }),

  completeMission: (missionKey) =>
    set((state) => ({
      currentMissionIndex: state.currentMissionIndex + 1,
      completedMissions: state.completedMissions.includes(missionKey)
        ? state.completedMissions
        : [...state.completedMissions, missionKey],
    })),

  unlockCampaigns: (campaignIds) =>
    set((state) => ({
      unlockedCampaigns: Array.from(new Set([...state.unlockedCampaigns, ...campaignIds])),
    })),

  unlockAchievements: (badgeKeys) => {
    const state = get();
    const genuinelyNew = badgeKeys.filter((k) => !state.achievements.includes(k));
    if (genuinelyNew.length === 0) return;
    set({ achievements: [...state.achievements, ...genuinelyNew] });
    for (const key of genuinelyNew) {
      const def = ACHIEVEMENT_DEFS[key];
      if (def) showToast(def.icon, `Achievement unlocked: ${def.label}`);
    }
    confettiBurst(24);
  },

  hydrateProgress: (progress) =>
    set({
      displayName: progress.displayName,
      xp: progress.xp,
      rank: progress.rank,
      streak: progress.streak,
      completedMissions: progress.completedMissions,
      unlockedCampaigns: progress.unlockedCampaigns.length
        ? progress.unlockedCampaigns
        : ["retriever"],
      achievements: progress.achievements,
      activeCampaignId: progress.activeCampaignId,
      currentMissionIndex: progress.currentMissionIndex,
      slotValues: progress.slotValues,
      pendingBuildTimerSeconds: progress.buildTimerSeconds,
      progressLoaded: true,
    }),

  startCampaignBuild: (campaignId) =>
    set((state) =>
      state.activeCampaignId === campaignId
        ? state
        : { activeCampaignId: campaignId, currentMissionIndex: 0, slotValues: {} }
    ),

  clearActiveBuild: () => set({ activeCampaignId: null }),

  bumpTimerSeconds: (delta) =>
    set((state) => ({
      timerSeconds: state.timerSeconds + delta,
      pendingBuildTimerSeconds: 0,
    })),

  tick: () => {
    if (get().timerRunning) {
      set((state) => ({ timerSeconds: state.timerSeconds + 1 }));
    }
  },

  toggleMentor: () => set((state) => ({ mentorOpen: !state.mentorOpen })),

  setActiveContext: (context) => set({ activeContext: context }),

  forgeAgent: (agent) =>
    set((state) => ({
      forgedAgents: [agent, ...state.forgedAgents],
    })),

  updateForgedAgent: (id, updates) =>
    set((state) => ({
      forgedAgents: state.forgedAgents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),

  setInspectorSlot: (key, value) =>
    set((state) => ({
      inspectorDirtySlots: { ...state.inspectorDirtySlots, [key]: value },
    })),

  toggleInspectorMode: () =>
    set((state) => ({
      inspectorMode: state.inspectorMode === "study" ? "edit" : "study",
    })),

  resetInspector: () => set({ inspectorDirtySlots: {} }),
}));
