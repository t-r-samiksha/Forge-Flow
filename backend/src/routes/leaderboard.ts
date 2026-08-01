import { Router, type Request, type Response } from "express";
import { db } from "../db";

const router = Router();

interface LeaderboardRow {
  id: string;
  display_name: string | null;
  xp: number;
  rank: string;
  streak: number;
}

interface ForgedCountRow {
  user_id: string;
  c: number;
}

router.get("/", (req: Request, res: Response) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const rows = db
    .prepare("SELECT id, display_name, xp, rank, streak FROM users ORDER BY xp DESC LIMIT ?")
    .all(limit) as LeaderboardRow[];

  const counts = db
    .prepare("SELECT user_id, COUNT(*) AS c FROM forged_agents GROUP BY user_id")
    .all() as ForgedCountRow[];
  const countByUser = new Map(counts.map((c) => [c.user_id, c.c]));

  res.json(
    rows.map((r) => ({
      userId: r.id,
      displayName: r.display_name,
      xp: r.xp,
      rank: r.rank,
      streak: r.streak,
      agentCount: countByUser.get(r.id) ?? 0,
    }))
  );
});

export default router;
