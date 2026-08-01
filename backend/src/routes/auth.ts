import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { loadProgress } from "./progress";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** No passwords — a "login" is just choosing a stable identity. The email
 * is normalized into the id itself so typing the same email (from any
 * browser/device) always resolves to the same account. The display name
 * shown around the app is just the local part before "@", not the full
 * address — a leaderboard showing someone's complete email is a real
 * privacy leak that a callsign-style name never was. */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

router.post("/login", (req: Request, res: Response) => {
  const { email } = (req.body ?? {}) as { email?: string };
  const trimmedEmail = (email ?? "").trim().toLowerCase();

  if (!EMAIL_RE.test(trimmedEmail)) {
    return res.status(400).json({ error: "Enter a valid email to log in with." });
  }

  const userId = slugify(trimmedEmail);
  if (!userId) {
    return res.status(400).json({ error: "Enter a valid email to log in with." });
  }

  const displayName = trimmedEmail.split("@")[0] || trimmedEmail;

  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (existing) {
    db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(displayName, userId);
  } else {
    db.prepare(
      `INSERT INTO users (id, display_name, xp, rank, streak, completed_missions, unlocked_campaigns)
       VALUES (?, ?, 0, 'Recruit', 0, '[]', '["retriever"]')`
    ).run(userId, displayName);
  }

  return res.json({ userId, ...loadProgress(userId) });
});

export default router;
