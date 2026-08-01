// Mirrors backend/src/services/achievements.ts's ACHIEVEMENT_DEFS —
// duplicated rather than fetched since it's small, static metadata
// (same pattern as campaigns.ts's UNLOCK_MAP mirroring on the backend).
export interface AchievementDef {
  label: string;
  description: string;
  icon: string;
}

export const ACHIEVEMENT_DEFS: Record<string, AchievementDef> = {
  first_forge: { label: "First Forge", description: "Shipped your first agent.", icon: "🔨" },
  speed_forge: {
    label: "Speed Forge",
    description: "Shipped an agent in under 15 minutes.",
    icon: "⚡",
  },
  zero_hallucination: {
    label: "Zero Hallucination",
    description: "Shipped an agent with temperature ≤ 0.2.",
    icon: "🎯",
  },
  collection_start: {
    label: "Collection Start",
    description: "Forged 3 different agents.",
    icon: "📚",
  },
  mentors_favorite: {
    label: "Mentor's Favorite",
    description: "Asked Nova 10+ questions.",
    icon: "🧭",
  },
  scientist: {
    label: "Scientist",
    description: "Ran 20+ test queries against a shipped agent.",
    icon: "🔬",
  },
  streak_master: {
    label: "Streak Master",
    description: "Maintained a 7-day forge streak.",
    icon: "🔥",
  },
};
