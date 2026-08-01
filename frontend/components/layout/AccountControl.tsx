"use client";

import { useEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import { loginOrCreateUser } from "@/lib/api";
import { getDisplayName, setSession, logout } from "@/lib/session";

type PanelMode = "closed" | "menu" | "form";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AccountControl() {
  const [displayName, setDisplayNameState] = useState<string | null>(null);
  const [mode, setMode] = useState<PanelMode>("closed");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDisplayNameState(getDisplayName());
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

  const submitLogin = async () => {
    const trimmed = email.trim();
    if (!trimmed || submitting) return;
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await loginOrCreateUser(trimmed);
      const shownName = trimmed.split("@")[0] || trimmed;
      setSession(result.userId, shownName);
      // Full reload: every screen reads identity via getUserId() directly
      // (not through reactive state), so a hard navigation is the simplest
      // way to make the whole app pick up the new identity consistently.
      window.location.href = "/campaigns";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log in — try again.");
      setSubmitting(false);
    }
  };

  const doLogout = () => {
    logout();
    window.location.href = "/campaigns";
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setMode((m) => (m === "closed" ? (displayName ? "menu" : "form") : "closed"))}
        className="flex h-9 items-center gap-1.5 rounded-md border border-line-2 bg-panel px-3 text-sm text-dim transition-colors hover:border-violet hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
      >
        <User size={16} />
        {displayName ?? "Log in"}
      </button>

      {mode === "menu" && displayName && (
        <div className="ccard-menu" style={{ top: 40, left: "auto", right: 0 }}>
          <button
            type="button"
            className="ccard-menu-item"
            onClick={() => {
              setEmail("");
              setError(null);
              setMode("form");
            }}
          >
            🔁 Switch profile
          </button>
          <button type="button" className="ccard-menu-item" onClick={doLogout}>
            🚪 Log out
          </button>
        </div>
      )}

      {mode === "form" && (
        <div className="ccard-menu" style={{ top: 40, left: "auto", right: 0, minWidth: 260, padding: 12 }}>
          <p className="mb-2 font-mono text-[11px] leading-relaxed text-mute">
            No password — just your email. The same email (from any device) returns to the same
            progress.
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
              if (e.key === "Enter") void submitLogin();
            }}
            placeholder="you@example.com"
            className="mb-2 w-full rounded-md border border-line bg-panel-2 px-2.5 py-2 text-sm text-text outline-none focus:border-violet"
          />
          {error && <p className="mb-2 font-mono text-[11px] text-rose">⚠ {error}</p>}
          <button
            type="button"
            onClick={() => void submitLogin()}
            disabled={!email.trim() || submitting}
            className="w-full rounded-md bg-violet px-3 py-2 text-sm font-semibold text-on-accent transition-opacity disabled:opacity-50"
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </div>
      )}
    </div>
  );
}
