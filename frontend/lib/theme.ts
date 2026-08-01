export type Theme = "dark" | "light";

const STORAGE_KEY = "forge_theme";

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : null;
}

/** localStorage wins if the user has ever explicitly chosen; otherwise
 * follow the OS/browser preference, defaulting to dark (the product's
 * native theme) when neither signal is available. */
export function resolveInitialTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(STORAGE_KEY, theme);
}

/** Inlined into a blocking <script> in the root layout's <head> — runs
 * before first paint so the correct theme is on <html> before any CSS
 * resolves, avoiding a flash of the wrong theme. Kept as a plain string
 * (not imported/executed) since it must run standalone, before React
 * or any module graph exists. */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
