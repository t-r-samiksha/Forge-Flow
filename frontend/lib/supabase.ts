import { createClient } from "@supabase/supabase-js";

/** Real Supabase client (§36) — anon key only, safe for the browser (RLS
 * would gate any direct DB access, though this app doesn't use Supabase's
 * Postgres at all; Supabase here is purely the real identity provider —
 * magic-link email delivery + session issuance. App data still lives in
 * this backend's own SQLite via the Express API, gated by requireAuth
 * verifying the session token this client holds.) */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase's current name for what used to be called the "anon" key —
// same public, RLS-scoped privilege level, safe to ship to the browser.
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = !!url && !!publishableKey;

export const supabase = createClient(url ?? "https://placeholder.supabase.co", publishableKey ?? "placeholder", {
  auth: {
    // We own the redirect target explicitly (see /auth/callback), and
    // read the session via getSession()/onAuthStateChange rather than
    // relying on any implicit-flow URL parsing.
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Dev-only escape hatch for local testing when Supabase's own built-in
// email rate limit is hit (very low by default — the real fix is a
// custom SMTP provider in the Supabase dashboard). Guarded on
// NODE_ENV !== "production" so this never ships in a production build;
// `scripts/dev-magic-link.ts` prints the exact console command that uses
// this to set a real, Supabase-issued session (no email round trip).
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __forgeflowSupabase: typeof supabase }).__forgeflowSupabase = supabase;
}
