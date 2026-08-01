"use client";

import { useEffect } from "react";
import { getProgress } from "@/lib/api";
import { getUserId } from "@/lib/session";
import { useGameStore, type Rank } from "@/lib/store";

const VALID_RANKS: Rank[] = ["Recruit", "Engineer", "Architect", "Forgemaster"];

function toRank(value: string): Rank {
  return (VALID_RANKS as string[]).includes(value) ? (value as Rank) : "Recruit";
}

export default function ProgressSync() {
  const hydrateProgress = useGameStore((s) => s.hydrateProgress);

  useEffect(() => {
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
        // Backend unreachable — still mark progress as "loaded" (with
        // nothing to resume) so gates like BuildScreen's don't hang
        // waiting on a fetch that's never going to resolve.
        hydrateProgress({
          displayName: null,
          xp: 0,
          rank: "Recruit",
          streak: 0,
          completedMissions: [],
          unlockedCampaigns: ["retriever"],
          achievements: [],
          activeCampaignId: null,
          currentMissionIndex: 0,
          slotValues: {},
          buildTimerSeconds: 0,
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
