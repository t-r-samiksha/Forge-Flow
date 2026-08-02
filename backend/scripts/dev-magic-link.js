/**
 * Dev-only helper (§36) — signs you into a real Supabase session locally
 * without sending a real email, for when Supabase's own built-in email
 * rate limit is hit during testing (its default is very low; the real
 * fix for anything beyond quick local testing is a custom SMTP provider
 * in the Supabase dashboard: Auth -> SMTP Settings).
 *
 * This still produces a completely real, Supabase-issued session (via
 * the real admin.generateLink + verifyOtp round trip) — it just skips
 * the "wait for an email" step. Requires the real SUPABASE_SECRET_KEY
 * (backend .env), never runs in the browser, never ships to production.
 *
 * Usage:
 *   node scripts/dev-magic-link.js you@example.com
 */
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/dev-magic-link.js you@example.com");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !secretKey) {
  console.error("SUPABASE_URL / SUPABASE_SECRET_KEY missing from backend/.env");
  process.exit(1);
}
if (!publishableKey) {
  console.error(
    "No publishable/anon key found in backend/.env (SUPABASE_PUBLISHABLE_KEY) — " +
      "add the same value frontend/.env.local uses for NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
  );
  process.exit(1);
}

const admin = createClient(url, secretKey);
const anon = createClient(url, publishableKey);

(async () => {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) {
    console.error("generateLink failed:", linkError.message);
    process.exit(1);
  }

  const { data, error } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "signup",
  });
  if (error) {
    console.error("verifyOtp failed:", error.message);
    process.exit(1);
  }

  console.log(`\n✓ Real Supabase session established for ${email} (user id: ${data.user.id})\n`);
  console.log("Open http://localhost:3000, open devtools console on that page, and paste:\n");
  console.log(
    `await window.__forgeflowSupabase.auth.setSession({ access_token: ${JSON.stringify(
      data.session.access_token
    )}, refresh_token: ${JSON.stringify(data.session.refresh_token)} }); location.reload();`
  );
  console.log("\n(then reload if it doesn't happen automatically — you'll be signed in for real)\n");
})();
