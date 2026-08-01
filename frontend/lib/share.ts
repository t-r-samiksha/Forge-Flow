/** Public share links: the payload is base64url-encoded JSON carried in
 * the URL path itself — no backend storage, so a shared link works
 * forever with zero server state. Base64url (not plain base64) because
 * the payload sits inside a Next.js dynamic route segment, where a
 * stray "/" from standard base64 would split the URL. */
function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(b64url: string): string {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return padded + pad;
}

export function encodeSharePayload(data: unknown): string {
  const json = JSON.stringify(data);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return toBase64Url(b64);
}

export function decodeSharePayload<T>(payload: string): T {
  const b64 = fromBase64Url(payload);
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json) as T;
}

export type ShareType = "cert" | "compare";

export function buildShareUrl(type: ShareType, data: unknown): string {
  const payload = encodeSharePayload(data);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/share/${type}/${payload}`;
}
