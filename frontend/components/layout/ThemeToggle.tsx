"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { resolveInitialTheme, applyTheme, type Theme } from "@/lib/theme";

/** Cross-fades the whole document via the View Transitions API when
 * supported (Chrome/Edge) — a document-level snapshot diff, so it
 * doesn't fight the extensive per-selector `transition` rules already
 * declared throughout globals.css. Falls back to an instant switch
 * where unsupported, which is a graceful degradation, not a broken
 * one. Skipped under reduced motion per the hard requirement. */
function switchThemeWithTransition(next: Theme, apply: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => void;
  };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (doc.startViewTransition && !reduceMotion) {
    doc.startViewTransition(apply);
  } else {
    apply();
  }
}

export default function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(resolveInitialTheme());
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    switchThemeWithTransition(next, () => {
      applyTheme(next);
      setThemeState(next);
    });
  };

  // Avoid a hydration flash: the server has no way to know the user's
  // stored/OS theme preference, so render a neutral placeholder with the
  // same footprint until the client has resolved it post-mount.
  if (!mounted) {
    return (
      <div
        aria-hidden="true"
        className="h-9 w-9 rounded-md border border-line-2 bg-panel"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-line-2 bg-panel text-dim transition-colors hover:border-violet hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
