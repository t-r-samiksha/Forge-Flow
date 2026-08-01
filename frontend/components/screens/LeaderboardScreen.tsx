"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/api";
import { getUserId } from "@/lib/session";
import LeaderboardRows from "@/components/gamification/LeaderboardRows";

export default function LeaderboardScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);
  const userId = typeof window !== "undefined" ? getUserId() : "";

  useEffect(() => {
    getLeaderboard(50)
      .then(setEntries)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-16">
      <div className="subnav">
        <button type="button" className="back-link" onClick={() => router.push("/campaigns")}>
          ← back to ForgeFlow
        </button>
      </div>

      <div className="learn-hero">
        <div className="learn-kicker">Season 1 · all forgers</div>
        <h1>
          Top of the <span className="accent">forge</span>.
        </h1>
        <p className="lede" style={{ marginBottom: 0 }}>
          Ranked by total XP across every campaign. Ship more agents, climb the board.
        </p>
      </div>

      <div style={{ maxWidth: 640, marginTop: 26 }}>
        {error && (
          <div className="rounded-xl border border-rose/40 bg-[rgba(var(--color-rose-rgb)/.08)] px-5 py-3 font-mono text-xs text-rose">
            ⚠ Couldn&apos;t reach the leaderboard — the backend may be offline.
          </div>
        )}

        {!error && !entries && <p className="font-mono text-xs text-mute">Loading standings…</p>}

        {entries && entries.length === 0 && (
          <p className="font-mono text-xs text-mute">
            Nobody&apos;s forged an agent yet — ship one to take the top spot.
          </p>
        )}

        {entries && entries.length > 0 && (
          <div className="lb-widget" style={{ position: "static" }}>
            <div className="lb-list">
              <LeaderboardRows entries={entries} userId={userId} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
