/**
 * Canonical workspace-plane REST: `/t/:workspaceSlug/api/...` (tenant from URL).
 * Control-plane routes stay `/api/...` (auth, me, registration, admin, ontology, etc.).
 */

let workspaceApiCanonicalSlug: string | null = null;

export function setWorkspaceApiCanonicalSlug(slug: string | null): void {
  workspaceApiCanonicalSlug = slug?.trim() ? slug.trim() : null;
}

export function getWorkspaceApiCanonicalSlug(): string | null {
  return workspaceApiCanonicalSlug;
}

export function isControlPlaneApiPath(path: string): boolean {
  const p = path.split("?")[0] ?? path;
  if (p.startsWith("/api/auth")) return true;
  if (p === "/api/me" || p.startsWith("/api/me/")) return true;
  if (p.startsWith("/api/tenant-requests")) return true;
  if (p.startsWith("/api/tenants/by-slug/")) return true;
  if (p.startsWith("/api/mcp/agent-context")) return true;
  if (p === "/api/health") return true;
  if (p.startsWith("/api/admin")) return true;
  if (p.startsWith("/api/ontology")) return true;
  if (p.startsWith("/api/agent")) return true;
  if (p.startsWith("/api/tenants")) return true;
  return false;
}

/** Rewrite `/api/...` hub calls to `/t/:slug/api/...` when a workspace slug is active. */
export function applyWorkspacePrefixToApiPath(path: string): string {
  if (!workspaceApiCanonicalSlug || isControlPlaneApiPath(path)) return path;
  if (!path.startsWith("/api/")) return path;
  return `/t/${encodeURIComponent(workspaceApiCanonicalSlug)}${path}`;
}
