/**
 * Hub URLs are prefixed with `/t/:workspaceSlug` while logical nav paths
 * (MANAGED_NAV_PATHS, hiddenNavPaths) stay unprefixed (e.g. `/priority`).
 */

const WORKSPACE_PATH_RE = /^\/t\/([^/]+)(\/.*)?$/;

export type ParsedWorkspacePath = { slug: string; innerPath: string };

/**
 * Parse `/t/:slug` or `/t/:slug/...` into slug and inner path (always starts with `/`, `/` for home).
 */
export function parseWorkspacePath(pathname: string): ParsedWorkspacePath | null {
  const m = pathname.match(WORKSPACE_PATH_RE);
  if (!m) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]).trim();
  } catch {
    return null;
  }
  if (!slug) return null;
  const rest = m[2] ?? "";
  const innerPath = rest === "" || rest === "/" ? "/" : rest.startsWith("/") ? rest : `/${rest}`;
  return { slug, innerPath };
}

/**
 * Strip `/t/:slug` prefix; return logical path for comparisons. Non-prefixed paths returned as-is.
 */
export function stripWorkspacePrefix(pathname: string): string {
  const p = parseWorkspacePath(pathname);
  if (!p) return pathname;
  return p.innerPath;
}

/**
 * Build full pathname: `/t/slug` for logical `/`, else `/t/slug/priority` etc.
 * `logicalPath` must start with `/`.
 */
export function withWorkspacePrefix(slug: string, logicalPath: string): string {
  const s = slug.trim();
  const path = logicalPath.startsWith("/") ? logicalPath : `/${logicalPath}`;
  if (!s) return path;
  if (path === "/") return `/t/${encodeURIComponent(s)}`;
  return `/t/${encodeURIComponent(s)}${path}`;
}

/**
 * True if pathname is under workspace hub prefix `/t/:slug`.
 */
export function isWorkspacePrefixedPath(pathname: string): boolean {
  return parseWorkspacePath(pathname) !== null;
}

/**
 * Logical hub path to preserve when switching workspace: inner segment under `/t/:slug`,
 * or the full pathname for legacy unprefixed hub URLs (e.g. `/priority`).
 */
export function hubInnerPathForTenantSwitch(pathname: string): string {
  const p = parseWorkspacePath(pathname);
  if (p) return p.innerPath;
  if (!pathname || pathname === "/") return "/";
  return pathname;
}
