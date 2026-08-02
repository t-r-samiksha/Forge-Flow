"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A real, dedicated Supabase account (created via the real admin API,
 * password set for real) — not a bypass or a client-side fallback
 * identity. It can only ever access its own account's data, the same as
 * any other real sign-in; publishing its credentials is the same
 * tradeoff as any public "try the demo" account. Lets someone showing
 * the product sign in with one click instead of waiting on a real
 * inbox. */
const DEMO_EMAIL = "demo@forgeflow.dev";
const DEMO_PASSWORD = "ForgeFlow-Demo-2026!";

/** The real sign-in implementation (§36) — used both inline in
 * AccountControl's dropdown and full-page at /sign-in (the real 401
 * redirect target), so there is exactly one place that calls
 * signInWithOtp/signInWithPassword, not copies that could drift. A real
 * email gets sent by Supabase for the normal path; there is no
 * client-side fallback identity anymore. */
export default function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [demoSubmitting, setDemoSubmitting] = useState(false);

  const submitDemo = async () => {
    if (demoSubmitting || !supabaseConfigured) return;
    setDemoSubmitting(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      if (signInError) throw signInError;
      // Client-side navigation, not a hard reload (§36 fix) — Supabase's
      // in-memory session updates synchronously via onAuthStateChange
      // before this line runs, but a full page reload immediately after
      // sign-in can race ahead of the session actually being flushed to
      // storage, causing the fresh page load to briefly see "signed out",
      // fire a real 401, and get signed back out by that 401's own real
      // handler. A client-side route change reuses the already-updated
      // in-memory session instead of re-reading it from scratch.
      router.push(next || "/campaigns");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in to the demo account — try again.");
      setDemoSubmitting(false);
    }
  };

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed || submitting) return;
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email.");
      return;
    }
    if (!supabaseConfigured) {
      setError("Supabase isn't configured yet (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      const { error: sendError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo },
      });
      if (sendError) throw sendError;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the sign-in link — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <p className="font-mono text-[11.5px] leading-relaxed text-spring">
        ✓ Real link sent to <b>{email.trim()}</b> — open it on this device to finish signing in.
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void submitDemo()}
        disabled={demoSubmitting}
        className="mb-3 w-full rounded-md border border-violet bg-panel-2 px-3 py-2 text-sm font-semibold text-violet-hi transition-opacity hover:bg-panel-3 disabled:opacity-50"
      >
        {demoSubmitting ? "Signing in…" : "🚀 Try the demo — sign in instantly"}
      </button>
      <p className="mb-3 font-mono text-[10px] text-mute">
        A real, dedicated account — for showing the product, not your own progress.
      </p>
      <div className="mb-3 border-t border-line" />
      <p className="mb-2 font-mono text-[11px] leading-relaxed text-mute">
        No password — a real one-time link is emailed to you. Click it from this device to sign in.
      </p>
      <input
        autoFocus
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        placeholder="you@example.com"
        className="mb-2 w-full rounded-md border border-line bg-panel-2 px-2.5 py-2 text-sm text-text outline-none focus:border-violet"
      />
      {error && <p className="mb-2 font-mono text-[11px] text-rose">⚠ {error}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!email.trim() || submitting}
        className="w-full rounded-md bg-violet px-3 py-2 text-sm font-semibold text-on-accent transition-opacity disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Email me a sign-in link"}
      </button>
    </div>
  );
}
