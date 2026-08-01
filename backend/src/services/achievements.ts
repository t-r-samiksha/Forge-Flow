import { db } from "../db";

/** Registry of the achievements that are actually computed server-side.
 * See AGENT_FORGE_DOCS.md §9 for the full aspirational list — Full
 * Wiring, Crew Chief, Perfectionist, and Tinkerer are deliberately
 * excluded (see the audit that shipped alongside this file: none of
 * them map cleanly onto what's actually built). */
export const ACHIEVEMENT_DEFS: Record<string, { label: string; description: string }> = {
  first_forge: { label: "First Forge", description: "Shipped your first agent." },
  speed_forge: { label: "Speed Forge", description: "Shipped an agent in under 15 minutes." },
  zero_hallucination: {
    label: "Zero Hallucination",
    description: "Shipped an agent with temperature ≤ 0.2.",
  },
  collection_start: { label: "Collection Start", description: "Forged 3 different agents." },
  mentors_favorite: { label: "Mentor's Favorite", description: "Asked Nova 10+ questions." },
  scientist: { label: "Scientist", description: "Ran 20+ test queries against a shipped agent." },
  streak_master: { label: "Streak Master", description: "Maintained a 7-day forge streak." },
};

/** Inserts a badge if the user doesn't already have it. Returns true
 * only when it was newly earned (so callers can toast/report it) —
 * false if they already had it, so re-checking on every event is safe. */
export function awardAchievement(userId: string, badgeKey: string): boolean {
  const result = db
    .prepare("INSERT OR IGNORE INTO achievements (user_id, badge_key) VALUES (?, ?)")
    .run(userId, badgeKey);
  return result.changes > 0;
}
