import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { db } from "../db";

/** Backend-only Supabase client, using the service_role key — never sent
 * to the frontend. Used for exactly two things: (1) verifying a bearer
 * token really was issued by our Supabase project (auth.getUser), and
 * (2) nothing else — app data still lives in SQLite, not Supabase's
 * Postgres. Supabase here is purely the real identity provider. */
let cached: SupabaseClient | null = null;

export class SupabaseAuthConfigError extends Error {}

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  // SUPABASE_SECRET_KEY is Supabase's current name for what used to be
  // called the service_role key — same elevated, backend-only privilege
  // level, never sent to the client.
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new SupabaseAuthConfigError(
      "Supabase is not configured on the backend (SUPABASE_URL / SUPABASE_SECRET_KEY missing)."
    );
  }
  cached = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return cached;
}

/** Same normalization the old email-only /login used, kept only so a
 * legacy pre-real-auth row (id = slugify(email)) can be found and linked
 * to the real Supabase id on first genuine sign-in — not used to derive
 * any id going forward. */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

interface UserRow {
  id: string;
  display_name: string | null;
}

/** Real id-linking (§36): called once per verified request. If a users
 * row already exists under this real Supabase id, just keeps its email
 * fresh. Otherwise, checks whether a row exists under the OLD
 * slugify(email) id (a real pre-migration account) — if so, migrates that
 * row's primary key to the real Supabase id in one transaction, cascading
 * every table that references it, rather than orphaning existing
 * progress/agents. Otherwise creates a brand-new row. Idempotent — safe
 * to call on every authenticated request. */
export function ensureLocalUser(supabaseUserId: string, email: string | null): void {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(supabaseUserId) as
    | UserRow
    | undefined;
  if (existing) {
    if (email) db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, supabaseUserId);
    return;
  }

  const legacyId = email ? slugify(email) : null;
  const legacyRow = legacyId
    ? (db.prepare("SELECT id, display_name FROM users WHERE id = ?").get(legacyId) as UserRow | undefined)
    : undefined;

  const migrate = db.transaction((fromId: string, toId: string) => {
    db.prepare("UPDATE users SET id = ?, email = ? WHERE id = ?").run(toId, email, fromId);
    db.prepare("UPDATE forged_agents SET user_id = ? WHERE user_id = ?").run(toId, fromId);
    db.prepare("UPDATE crews SET owner_user_id = ? WHERE owner_user_id = ?").run(toId, fromId);
    db.prepare("UPDATE knowledge_docs SET user_id = ? WHERE user_id = ?").run(toId, fromId);
    db.prepare("UPDATE tool_defs SET user_id = ? WHERE user_id = ?").run(toId, fromId);
    db.prepare("UPDATE redteam_runs SET user_id = ? WHERE user_id = ?").run(toId, fromId);
    db.prepare("UPDATE achievements SET user_id = ? WHERE user_id = ?").run(toId, fromId);
  });

  if (legacyRow) {
    migrate(legacyRow.id, supabaseUserId);
    return;
  }

  const displayName = email ? email.split("@")[0] || email : null;
  db.prepare(
    `INSERT INTO users (id, email, display_name, xp, rank, streak, completed_missions, unlocked_campaigns)
     VALUES (?, ?, ?, 0, 'Recruit', 0, '[]', '["retriever"]')`
  ).run(supabaseUserId, email, displayName);
}
