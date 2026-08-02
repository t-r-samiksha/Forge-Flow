"use client";

import { useEffect } from "react";
import { getProgress } from "@/lib/api";
import { getUserId, initAuth, isSignedIn, onAuthChange } from "@/lib/session";
import { useGameStore, type Rank } from "@/lib/store";

const VALID_RANKS: Rank[] = ["Recruit", "Engineer", "Architect", "Forgemaster"];

function toRank(value: string): Rank {
  return (VALID_RANKS as string[]).includes(value) ? (value as Rank) : "Recruit";
}

const BLANK_PROGRESS = {
  displayName: null as string | null,
  xp: 0,
  rank: "Recruit" as Rank,
  streak: 0,
  completedMissions: [] as string[],
  unlockedCampaigns: ["retriever"] as string[],
  achievements: [] as string[],
  activeCampaignId: null as string | null,
  currentMissionIndex: 0,
  slotValues: {} as Record<string, string>,
  buildTimerSeconds: 0,
};

export default function ProgressSync() {
  const hydrateProgress = useGameStore((s) => s.hydrateProgress);

  useEffect(() => {
    const sync = () => {
      if (!isSignedIn()) {
        // No real session (§36) — nothing to fetch; a client-fabricated
        // identity is no longer a thing this app has, so "signed out"
        // just means genuinely no progress yet, not a 401 loop.
        hydrateProgress(BLANK_PROGRESS);
        return;
      }
      getProgress(getUserId())
        .then((progress) =>
          hydrateProgress({
            displayName: progress.displayName,
            xp: progress.xp,
            rank: toRank(progress.rank),
            streak: progress.streak,
            completedMissions: progress.completedMissions,
            unlockedCampaigns: progress.unlockedCampaigns,
            achievements: progress.achievements,
            activeCampaignId: progress.activeCampaignId,
            currentMissionIndex: progress.currentMissionIndex,
            slotValues: progress.slotValues,
            buildTimerSeconds: progress.buildTimerSeconds,
          })
        )
        .catch(() => {
          // Backend unreachable (or a real 401 already being handled by
          // lib/api.ts's redirect) — still mark progress as "loaded" so
          // gates like BuildScreen's don't hang waiting on a fetch that's
          // never going to resolve.
          hydrateProgress(BLANK_PROGRESS);
        });
    };

    // initAuth() (kicked off by AuthBoot, mounted just before this
    // component) must resolve first — otherwise a genuinely signed-in
    // user's very first paint would call getProgress() before Supabase's
    // session has even been read back from storage, and get a spurious
    // 401 for someone who is, in fact, signed in.
    initAuth().then(sync);
    // Re-sync whenever the real session actually changes (sign-in from
    // the header dropdown or the /auth/callback redirect, sign-out) so
    // progress reflects the current account without a full page reload.
    return onAuthChange(sync);
  }, [hydrateProgress]);

  return null;
}
