import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { chatWithMentorAgent, LyzrConfigError } from "../services/lyzr";
import { db } from "../db";
import { awardAchievement } from "../services/achievements";

const router = Router();

router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { message, context, userId, sessionId } = (req.body ?? {}) as {
      message?: string;
      context?: string;
      userId?: string;
      sessionId?: string;
    };
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const prompt = context ? `Context: ${context}. Question: ${message}` : message;
    const resolvedUserId = userId || "anon";
    const resolvedSessionId = sessionId || uuidv4();

    const { response } = await chatWithMentorAgent(prompt, resolvedUserId, resolvedSessionId);

    const newAchievements: string[] = [];
    if (userId) {
      db.prepare(`INSERT OR IGNORE INTO users (id, last_forge_date) VALUES (?, ?)`).run(
        userId,
        new Date().toISOString().slice(0, 10)
      );
      db.prepare(
        "UPDATE users SET mentor_questions_asked = COALESCE(mentor_questions_asked, 0) + 1 WHERE id = ?"
      ).run(userId);
      const row = db.prepare("SELECT mentor_questions_asked FROM users WHERE id = ?").get(userId) as
        | { mentor_questions_asked: number }
        | undefined;
      if ((row?.mentor_questions_asked ?? 0) >= 10 && awardAchievement(userId, "mentors_favorite")) {
        newAchievements.push("mentors_favorite");
      }
    }

    return res.json({ response, newAchievements });
  } catch (err) {
    if (err instanceof LyzrConfigError) {
      return res.status(503).json({ error: err.message, code: "LYZR_NOT_CONFIGURED" });
    }
    console.error(err);
    return res.status(502).json({ error: "Failed to reach Nova" });
  }
});

export default router;
