"use client";

import { useEffect } from "react";
import { initAuth } from "@/lib/session";

/** Primes the real Supabase session cache as early as possible (§36) —
 * mounted first in the root layout, before anything that reads
 * getUserId()/isSignedIn() synchronously. Renders nothing; ProgressSync
 * and any protected call additionally await initAuth() itself before
 * firing its first request, so this is a head start, not the only guard. */
export default function AuthBoot() {
  useEffect(() => {
    void initAuth();
  }, []);
  return null;
}
