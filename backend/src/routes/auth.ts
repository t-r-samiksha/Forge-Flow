import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { loadProgress } from "./progress";

const router = Router();

/** Real sign-in is now entirely Supabase's (magic-link OTP, verified
 * server-side by requireAuth on every request — see middleware/auth.ts).
 * There is no /login route here anymore; the old slugify(email)-as-userId
 * "login" (no password, no verification, no email ever sent) has been
 * removed rather than left running alongside real auth (§36).
 *
 * This route is called once by the frontend right after a real Supabase
 * session is established, purely to surface this account's real progress
 * immediately (requireAuth's ensureLocalUser has already linked/created
 * the local users row by the time this handler runs). */
router.get("/session", requireAuth, (req, res: Response) => {
  const { userId } = req as AuthedRequest;
  res.json({ userId, ...loadProgress(userId) });
});

export default router;
