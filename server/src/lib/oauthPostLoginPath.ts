/** OAuth post-login redirect: open-path only (no protocol/host), prevents open redirects. */
const ALLOWED_POST_LOGIN_PATHS = new Set(["/register-workspace", "/"]);

export function normalizeAllowlistedPostLoginPath(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t.startsWith("/") || t.includes("//") || t.includes("?")) return undefined;
  if (!ALLOWED_POST_LOGIN_PATHS.has(t)) return undefined;
  return t;
}
