"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

/** Real magic-link landing page (§36) — Supabase redirects here (PKCE
 * flow) with a real `code` query param after the emailed link is clicked.
 * exchangeCodeForSession is a genuine round trip to Supabase's auth
 * server, not a local decode — only a real, unexpired code from a real
 * email succeeds here. */
export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const next = searchParams.get("next") || "/campaigns";
    if (!code) {
      setError("Missing sign-in code — this link may have already been used.");
      return;
    }
    supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      if (exchangeError) {
        setError(exchangeError.message);
        return;
      }
      router.replace(next);
    });
  }, [router, searchParams]);

  return (
    <div className="mx-auto max-w-[480px] px-6 py-24 text-center">
      {error ? (
        <>
          <p className="mb-2 font-mono text-sm text-rose">⚠ {error}</p>
          <p className="font-mono text-[12px] text-mute">
            Request a fresh link from the account menu and try again.
          </p>
        </>
      ) : (
        <p className="font-mono text-[12px] text-mute">Confirming your real sign-in…</p>
      )}
    </div>
  );
}
