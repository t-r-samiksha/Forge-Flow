import type { LeaderboardEntry } from "@/lib/api";

export function medalFor(i: number): string {
  return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1);
}

function rowTopClass(i: number): string {
  return i === 0 ? " top1" : i === 1 ? " top2" : i === 2 ? " top3" : "";
}

/** Shared `.lb-row` markup — used by both the full /leaderboard page and
 * the compact sidebar widget on /campaigns, so the two never drift out
 * of sync. Renders the exact reference `.lb-row`/`.lb-rank`/`.lb-av`/
 * `.lb-info`/`.lb-name`/`.lb-xp`/`.lb-fire` structure. */
export default function LeaderboardRows({
  entries,
  userId,
}: {
  entries: LeaderboardEntry[];
  userId: string;
}) {
  return (
    <>
      {entries.map((e, i) => {
        const you = e.userId === userId;
        const name = e.displayName || "Anonymous forger";
        return (
          <div key={e.userId} className={`lb-row${you ? " you" : ""}${rowTopClass(i)}`}>
            <div className="lb-rank">{medalFor(i)}</div>
            <div className="lb-av">{you ? "★" : name.slice(0, 2).toUpperCase()}</div>
            <div className="lb-info">
              <div className="lb-name">
                {you ? "You" : name}
                {e.streak > 2 && <span className="lb-fire">🔥{e.streak}</span>}
              </div>
              <div className="lb-xp">
                {e.xp} XP · {e.rank}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
