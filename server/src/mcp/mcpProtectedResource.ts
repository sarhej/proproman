/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) URLs for Tymio MCP.
 * Streamable HTTP clients (e.g. Cursor) expect the advertised `resource` URL
 * to match the MCP Server URL; root `/mcp` and `/t/<slug>/mcp` need distinct PRM.
 */

const MCP_SCOPES = ["mcp:tools"] as const;
const RESOURCE_NAME = "Tymio MCP";

export function globalMcpProtectedResourceMetadataPath(): string {
  return "/mcp";
}

/** Path segment after `/.well-known/oauth-protected-resource` for a workspace MCP URL. */
export function tenantMcpProtectedResourceMetadataPath(workspaceSlug: string): string {
  const slug = workspaceSlug.trim();
  if (!slug) return "/mcp";
  return `/t/${encodeURIComponent(slug)}/mcp`;
}

export function globalMcpProtectedResourceMetadataUrl(baseNoSlash: string): string {
  const b = baseNoSlash.replace(/\/$/, "");
  return `${b}/.well-known/oauth-protected-resource${globalMcpProtectedResourceMetadataPath()}`;
}

export function tenantMcpProtectedResourceMetadataUrl(baseNoSlash: string, workspaceSlug: string): string {
  const b = baseNoSlash.replace(/\/$/, "");
  const path = tenantMcpProtectedResourceMetadataPath(workspaceSlug);
  return `${b}/.well-known/oauth-protected-resource${path}`;
}

/** Canonical Streamable HTTP MCP URL for this workspace (matches Express route). */
export function tenantMcpResourceHref(baseNoSlash: string, workspaceSlug: string): string {
  const b = baseNoSlash.replace(/\/$/, "");
  const slug = workspaceSlug.trim();
  return new URL(`/t/${encodeURIComponent(slug)}/mcp`, `${b}/`).href;
}

export function buildTenantMcpProtectedResourceMetadata(
  baseNoSlash: string,
  issuerHref: string,
  workspaceSlug: string
): {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  resource_name: string;
} {
  return {
    resource: tenantMcpResourceHref(baseNoSlash, workspaceSlug),
    authorization_servers: [issuerHref],
    scopes_supported: [...MCP_SCOPES],
    resource_name: RESOURCE_NAME
  };
}
