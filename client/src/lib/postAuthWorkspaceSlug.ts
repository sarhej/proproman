/**
 * When signing in from `/t/:slug`, OAuth should return to `/t/:slug`. If the server
 * session loses `pendingTenantSlug` (cookie/session edge cases), we still have the slug
 * here so the client can recover by redirecting from `/` to `/t/:slug`.
 */
export const POST_AUTH_WORKSPACE_SLUG_KEY = "tymio.postAuthWorkspaceSlug";

export function rememberPostAuthWorkspaceSlug(slug: string): void {
  const s = slug.trim();
  if (!s) return;
  try {
    sessionStorage.setItem(POST_AUTH_WORKSPACE_SLUG_KEY, s);
  } catch {
    /* private mode / quota */
  }
}

export function clearPostAuthWorkspaceSlug(): void {
  try {
    sessionStorage.removeItem(POST_AUTH_WORKSPACE_SLUG_KEY);
  } catch {
    /* ignore */
  }
}

/** True when we should stay on a neutral full-screen state until we navigate to `/t/:slug`. */
export function hasPostAuthWorkspaceSlugPendingOnRoot(pathname: string): boolean {
  if (pathname !== "/") return false;
  try {
    return Boolean(sessionStorage.getItem(POST_AUTH_WORKSPACE_SLUG_KEY)?.trim());
  } catch {
    return false;
  }
}

/** Successful arrival on `/t/:slug` — drop the hint so later visits to `/` are not hijacked. */
export function clearPostAuthWorkspaceSlugIfSlugPath(pathname: string): void {
  const m = pathname.match(/^\/t\/([^/]+)/);
  if (!m) return;
  try {
    const stored = sessionStorage.getItem(POST_AUTH_WORKSPACE_SLUG_KEY);
    const seg = decodeURIComponent(m[1]).trim().toLowerCase();
    if (stored?.trim().toLowerCase() === seg) {
      sessionStorage.removeItem(POST_AUTH_WORKSPACE_SLUG_KEY);
    }
  } catch {
    /* ignore */
  }
}
