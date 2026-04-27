/** Discovery Streamable HTTP MCP URL (workspace-agnostic). */
export function hubDiscoveryMcpUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/mcp`;
}

/** Workspace-pinned MCP URL. */
export function hubWorkspaceMcpUrl(origin: string, workspaceSlug: string): string {
  const slug = workspaceSlug.trim();
  return `${origin.replace(/\/+$/, "")}/t/${encodeURIComponent(slug)}/mcp`;
}
