import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { awardAchievement } from "../services/achievements";
import { requireAuth, type AuthedRequest } from "../middleware/auth";

const router = Router();

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Real streak computation: same calendar day as last activity → no
 * change (so multiple actions in one day don't inflate it); exactly
 * one day later → +1; anything else (first-ever activity, or a
 * skipped day) → reset to 1. This was previously just a client-sent
 * value passed straight through — never actually computed. */
function computeStreak(lastForgeDate: string | null, existingStreak: number): number {
  const today = isoDate(new Date());
  if (lastForgeDate === today) return existingStreak || 1;
  const yesterday = isoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (lastForgeDate === yesterday) return existingStreak + 1;
  return 1;
}

const RANK_THRESHOLDS: [string, number][] = [
  ["Forgemaster", 150],
  ["Architect", 75],
  ["Engineer", 40],
  ["Recruit", 0],
];

function rankForXp(xp: number): string {
  return RANK_THRESHOLDS.find(([, floor]) => xp >= floor)?.[0] ?? "Recruit";
}

interface UserRow {
  id: string;
  display_name: string | null;
  xp: number;
  rank: string;
  streak: number;
  last_forge_date: string | null;
  completed_missions: string | null;
  unlocked_campaigns: string | null;
  active_campaign_id: string | null;
  current_mission_index: number | null;
  build_slot_values: string | null;
  build_timer_seconds: number | null;
}

interface AchievementRow {
  badge_key: string;
}

/** Mirrors campaigns.ts's Campaign.unlockAfter chain. Duplicated here
 * (rather than shared) since the backend has no access to the
 * frontend's data module — keep in sync when a new campaign is added. */
const UNLOCK_MAP: Record<string, string> = { retriever: "tool-agent" };

/** One-time backfill for sessions that shipped a campaign before this
 * unlock-persistence code existed — infers unlockedCampaigns from real
 * forged_agents rows rather than trusting a (possibly nonexistent or
 * stale) users row. Idempotent: re-running it never removes anything,
 * only adds campaigns the user has actually earned. */
function inferUnlocksFromForgedAgents(userId: string, current: string[]): string[] {
  const shippedRows = db
    .prepare("SELECT DISTINCT campaign_id FROM forged_agents WHERE user_id = ?")
    .all(userId) as { campaign_id: string }[];
  const unlocked = new Set(current);
  for (const { campaign_id } of shippedRows) {
    unlocked.add(campaign_id);
    const next = UNLOCK_MAP[campaign_id];
    if (next) unlocked.add(next);
  }
  return Array.from(unlocked);
}

export function loadProgress(userId: string) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as
    | UserRow
    | undefined;
  const achievementRows = db
    .prepare("SELECT badge_key FROM achievements WHERE user_id = ?")
    .all(userId) as AchievementRow[];

  const baseUnlocked = user
    ? (JSON.parse(user.unlocked_campaigns || '["retriever"]') as string[])
    : ["retriever"];
  const backfilledUnlocked = inferUnlocksFromForgedAgents(userId, baseUnlocked);
  const needsBackfill = backfilledUnlocked.length !== baseUnlocked.length;

  if (needsBackfill) {
    const today = new Date().toISOString().slice(0, 10);
    if (user) {
      db.prepare("UPDATE users SET unlocked_campaigns = ? WHERE id = ?").run(
        JSON.stringify(backfilledUnlocked),
        userId
      );
    } else {
      db.prepare(
        `INSERT INTO users (id, xp, rank, streak, last_forge_date, completed_missions, unlocked_campaigns)
         VALUES (?, 0, 'Recruit', 0, ?, '[]', ?)`
      ).run(userId, today, JSON.stringify(backfilledUnlocked));
    }
  }

  if (!user && !needsBackfill) {
    return {
      displayName: null as string | null,
      xp: 0,
      rank: "Recruit",
      streak: 0,
      completedMissions: [] as string[],
      unlockedCampaigns: ["retriever"] as string[],
      achievements: achievementRows.map((r) => r.badge_key),
      activeCampaignId: null as string | null,
      currentMissionIndex: 0,
      slotValues: {} as Record<string, string>,
      buildTimerSeconds: 0,
    };
  }

  return {
    displayName: user?.display_name ?? null,
    xp: user?.xp ?? 0,
    rank: user?.rank ?? "Recruit",
    streak: user?.streak ?? 0,
    completedMissions: user ? (JSON.parse(user.completed_missions || "[]") as string[]) : [],
    unlockedCampaigns: backfilledUnlocked,
    achievements: achievementRows.map((r) => r.badge_key),
    activeCampaignId: user?.active_campaign_id ?? null,
    currentMissionIndex: user?.current_mission_index ?? 0,
    slotValues: JSON.parse(user?.build_slot_values || "{}") as Record<string, string>,
    buildTimerSeconds: user?.build_timer_seconds ?? 0,
  };
}

// :userId in the URL is kept for the existing REST shape only — every
// handler below reads req.userId (requireAuth's token-verified identity),
// never the path param, so nobody can read/write another account's real
// progress (XP, streak, in-progress build) just by putting a different
// id in the URL (§36).
router.get("/:userId", requireAuth, (req: Request, res: Response) => {
  res.json(loadProgress((req as AuthedRequest).userId));
});

router.post("/:userId", requireAuth, (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).userId;
  const {
    xp,
    completedMissions,
    unlockedCampaigns,
    activeCampaignId,
    currentMissionIndex,
    slotValues,
    buildTimerSeconds,
  } = (req.body ?? {}) as {
    xp?: number;
    completedMissions?: string[];
    unlockedCampaigns?: string[];
    /** Explicit `null` clears the in-progress build (e.g. on ship);
     * omitted leaves whatever's already stored untouched. */
    activeCampaignId?: string | null;
    currentMissionIndex?: number;
    slotValues?: Record<string, string>;
    buildTimerSeconds?: number;
  };

  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as
    | UserRow
    | undefined;

  const nextXp = xp ?? existing?.xp ?? 0;
  const nextStreak = computeStreak(existing?.last_forge_date ?? null, existing?.streak ?? 0);
  const nextCompleted = JSON.stringify(
    completedMissions ?? JSON.parse(existing?.completed_missions || "[]")
  );
  const nextUnlocked = JSON.stringify(
    unlockedCampaigns ?? JSON.parse(existing?.unlocked_campaigns || '["retriever"]')
  );
  const nextActiveCampaignId =
    activeCampaignId !== undefined ? activeCampaignId : (existing?.active_campaign_id ?? null);
  const nextMissionIndex = currentMissionIndex ?? existing?.current_mission_index ?? 0;
  const nextSlotValues = JSON.stringify(
    slotValues ?? JSON.parse(existing?.build_slot_values || "{}")
  );
  const nextBuildTimerSeconds = buildTimerSeconds ?? existing?.build_timer_seconds ?? 0;
  const rank = rankForXp(nextXp);
  const today = isoDate(new Date());

  if (existing) {
    db.prepare(
      `UPDATE users
       SET xp = ?, rank = ?, streak = ?, last_forge_date = ?, completed_missions = ?, unlocked_campaigns = ?,
           active_campaign_id = ?, current_mission_index = ?, build_slot_values = ?, build_timer_seconds = ?
       WHERE id = ?`
    ).run(
      nextXp,
      rank,
      nextStreak,
      today,
      nextCompleted,
      nextUnlocked,
      nextActiveCampaignId,
      nextMissionIndex,
      nextSlotValues,
      nextBuildTimerSeconds,
      userId
    );
  } else {
    db.prepare(
      `INSERT INTO users
        (id, xp, rank, streak, last_forge_date, completed_missions, unlocked_campaigns,
         active_campaign_id, current_mission_index, build_slot_values, build_timer_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      nextXp,
      rank,
      nextStreak,
      today,
      nextCompleted,
      nextUnlocked,
      nextActiveCampaignId,
      nextMissionIndex,
      nextSlotValues,
      nextBuildTimerSeconds
    );
  }

  const newAchievements: string[] = [];
  if (nextStreak >= 7 && awardAchievement(userId, "streak_master")) {
    newAchievements.push("streak_master");
  }

  res.json({ ...loadProgress(userId), newAchievements });
});

export default router;
