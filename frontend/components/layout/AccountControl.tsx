"use client";

import { useEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import SignInForm from "@/components/auth/SignInForm";
import { getDisplayName, isSignedIn, logout, onAuthChange } from "@/lib/session";

type PanelMode = "closed" | "menu" | "form";

export default function AccountControl() {
  const [signedIn, setSignedIn] = useState(false);
  const [displayName, setDisplayNameState] = useState<string | null>(null);
  const [mode, setMode] = useState<PanelMode>("closed");
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Real session state (§36) — reflects Supabase's own auth events, not a
  // one-time read. isSignedIn()/getDisplayName() read the same cache
  // lib/session.ts's onAuthChange fires this on, so the button label and
  // menu contents stay correct across sign-in/out without a page reload.
  useEffect(() => {
    setSignedIn(isSignedIn());
    setDisplayNameState(getDisplayName());
    return onAuthChange(() => {
      setSignedIn(isSignedIn());
      setDisplayNameState(getDisplayName());
    });
  }, []);

  useEffect(() => {
    if (mode === "closed") return;
    const onClickOutside = (e: globalThis.MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMode("closed");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [mode]);

  const doLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
    setMode("closed");
    window.location.href = "/campaigns";
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setMode((m) => (m === "closed" ? (signedIn ? "menu" : "form") : "closed"))}
        className="flex h-9 items-center gap-1.5 rounded-md border border-line-2 bg-panel px-3 text-sm text-dim transition-colors hover:border-violet hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
      >
        <User size={16} />
        {signedIn ? (displayName ?? "Account") : "Log in"}
      </button>

      {mode === "menu" && signedIn && (
        <div className="ccard-menu" style={{ top: 40, left: "auto", right: 0 }}>
          <button type="button" className="ccard-menu-item" onClick={() => void doLogout()} disabled={loggingOut}>
            🚪 {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      )}

      {mode === "form" && !signedIn && (
        <div className="ccard-menu" style={{ top: 40, left: "auto", right: 0, minWidth: 260, padding: 12 }}>
          <SignInForm />
        </div>
      )}
    </div>
  );
}
