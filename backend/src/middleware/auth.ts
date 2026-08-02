import type { NextFunction, Request, Response } from "express";
import { getSupabaseAdmin, ensureLocalUser, SupabaseAuthConfigError } from "../services/supabaseAdmin";

/** The real, verified caller identity — set by requireAuth after a real
 * round trip to Supabase's auth server (auth.getUser), never trusted from
 * a client-supplied param/body field. Every ownership check in this
 * backend must read req.userId, not req.params.userId / req.body.userId
 * (§36) — those may still appear in a URL for REST shape/back-compat, but
 * they carry no authority. */
export interface AuthedRequest extends Request {
  userId: string;
  userEmail: string | null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header("authorization") || req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
  if (!token) {
    res.status(401).json({ error: "Missing Authorization: Bearer <token>" });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    // Real verification — this calls Supabase's own auth server to check
    // the token's signature/expiry, it does not just decode the JWT
    // locally and trust the payload.
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({ error: "Invalid or expired session." });
      return;
    }

    ensureLocalUser(data.user.id, data.user.email ?? null);
    (req as AuthedRequest).userId = data.user.id;
    (req as AuthedRequest).userEmail = data.user.email ?? null;
    next();
  } catch (err) {
    if (err instanceof SupabaseAuthConfigError) {
      res.status(503).json({ error: err.message, code: "SUPABASE_NOT_CONFIGURED" });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Failed to verify session." });
  }
}
