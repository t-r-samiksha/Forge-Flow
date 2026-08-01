"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/api";
import { getUserId } from "@/lib/session";
import LeaderboardRows from "./LeaderboardRows";

/** Persistent sidebar on /campaigns — mirrors the reference's always-on
 * `.lb-widget` next to the campaign grid, not just the standalone
 * /leaderboard page. Shows the top 6 by XP; "you" is pinned in if you'd
 * otherwise fall outside that window. */
export default function LeaderboardWidget() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const userId = typeof window !== "undefined" ? getUserId() : "";

  useEffect(() => {
    getLeaderboard(6)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  return (
    <div className="lb-widget">
      <div className="lb-head">
        <div className="lb-title">🏆 Forge Leaderboard</div>
        <div className="lb-live">
          <i />
          live
        </div>
      </div>

      {!entries && <p className="font-mono text-[11px] text-mute">Loading…</p>}
      {entries && entries.length === 0 && (
        <p className="font-mono text-[11px] text-mute">No forgers yet — be the first to ship.</p>
      )}
      {entries && entries.length > 0 && (
        <div className="lb-list">
          <LeaderboardRows entries={entries} userId={userId} />
        </div>
      )}

      <div className="lb-foot">
        <Link href="/leaderboard">View full leaderboard →</Link>
      </div>
    </div>
  );
}
