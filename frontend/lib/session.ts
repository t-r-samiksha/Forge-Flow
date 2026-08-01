const STORAGE_KEY = "forge_user_id";
const DISPLAY_NAME_KEY = "forge_display_name";

export function getUserId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

/** Present only once the user has explicitly logged in with a name —
 * absent for the anonymous, auto-generated identity `getUserId()`
 * falls back to on its own. */
export function getDisplayName(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(DISPLAY_NAME_KEY);
}

/** Switches the active identity to a named, logged-in profile. There's
 * no password — the id is derived from the name server-side, so typing
 * the same name again (from any browser) resolves to the same account.
 * Any progress under the previous anonymous id is left behind, not
 * merged; that's an accepted tradeoff for this project's scope. */
export function setSession(userId: string, displayName: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, userId);
  window.localStorage.setItem(DISPLAY_NAME_KEY, displayName);
}

/** Drops the named identity and returns to a fresh anonymous one —
 * the next getUserId() call auto-generates a new random id. */
export function logout(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(DISPLAY_NAME_KEY);
}
