/**
 * Hub origin for **unauthenticated** public routes (`/skills/*`, `/.well-known/opencode`).
 * Prefer `TYMIO_API_BASE_URL`; else derive host from `TYMIO_MCP_URL`; else production default.
 */
export function resolvePublicHubOrigin(): string {
  const api = process.env.TYMIO_API_BASE_URL?.trim() || process.env.DRD_API_BASE_URL?.trim();
  if (api) return api.replace(/\/+$/, "");
  const mcp = process.env.TYMIO_MCP_URL?.trim();
  if (mcp) {
    try {
      const u = new URL(mcp.includes("://") ? mcp : `https://${mcp}`);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* fall through */
    }
  }
  return "https://tymio.app";
}
