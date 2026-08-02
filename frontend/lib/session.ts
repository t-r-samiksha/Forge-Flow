import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** Real session state (§36), kept as a module-level cache so the ~20
 * existing call sites that read getUserId()/getAccessToken() synchronously
 * (inline in render, inside fetch calls) don't all need converting to
 * async/await — Supabase's own client is async, but the actual source of
 * truth (its in-memory session, refreshed via onAuthStateChange) is cheap
 * to mirror into a plain variable. initAuth() below primes this cache once
 * at app boot; nothing here fabricates an identity the way the old
 * localStorage-random-UUID fallback used to. */
let cachedSession: Session | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
const listeners = new Set<(session: Session | null) => void>();

function setCached(session: Session | null) {
  cachedSession = session;
  Array.from(listeners).forEach((l) => l(session));
}

/** Call once, as early as possible (root layout) — resolves once the
 * real current session (if any) has been read from Supabase, and keeps
 * cachedSession in sync with every subsequent real auth event
 * (sign-in, sign-out, token refresh) for the lifetime of the tab. */
export function initAuth(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = supabase.auth.getSession().then(({ data }) => {
    setCached(data.session);
    initialized = true;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    setCached(session);
    initialized = true;
  });
  return initPromise;
}

/** True once initAuth()'s first real getSession() round trip has resolved
 * — screens that need to know "is there really no session" rather than
 * "we just haven't checked yet" should gate on this (same loading-gate
 * pattern already used for build-resume checks elsewhere in this app). */
export function authReady(): boolean {
  return initialized;
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The real, verified Supabase user id — empty string if not signed in.
 * Never a client-fabricated identity (the old random-localStorage-UUID
 * fallback is gone): every protected backend route now requires a real
 * Bearer token regardless of what string ends up in a URL path segment,
 * so there is no meaningful "anonymous but still working" state anymore. */
export function getUserId(): string {
  return cachedSession?.user.id ?? "";
}

export function getUserEmail(): string | null {
  return cachedSession?.user.email ?? null;
}

/** Present only once signed in — the display shown around the app is
 * just the local part before "@", not the full address (same privacy
 * reasoning the old email-slug login already applied). */
export function getDisplayName(): string | null {
  const email = getUserEmail();
  if (!email) return null;
  return email.split("@")[0] || email;
}

export function getAccessToken(): string | null {
  return cachedSession?.access_token ?? null;
}

export function isSignedIn(): boolean {
  return !!cachedSession;
}

/** Real sign-out (§36) — revokes the session with Supabase, not just a
 * local storage clear. Every subsequent request's Bearer token is gone,
 * so a real 401 is what protected routes will return next. */
export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}
