/** MCP server key safe for Cursor / Claude Code config files. */
export function mcpServerName(workspaceSlug: string): string {
  const slug = workspaceSlug.trim();
  if (slug === "") return "tymio-discovery";
  return `tymio-${slug}`;
}

export function encodeMcpConfigBase64(config: Record<string, unknown>): string {
  const json = JSON.stringify(config);
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(json);
  }
  return Buffer.from(json, "utf8").toString("base64");
}

/**
 * One-click Cursor MCP install deeplink.
 * @see https://cursor.com/docs/context/mcp/install-links
 */
export function buildCursorMcpInstallLink(mcpUrl: string, serverName: string): string {
  const config = { url: mcpUrl };
  const configParam = encodeURIComponent(encodeMcpConfigBase64(config));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(serverName)}&config=${configParam}`;
}

/** Terminal one-liner for Claude Code (no MCP install deeplink exists). */
export function buildClaudeMcpAddCommand(mcpUrl: string, serverName: string): string {
  return `claude mcp add --transport http --scope project ${serverName} ${mcpUrl}`;
}

/** Project-scoped `.mcp.json` snippet for Claude Code (commit to git for teams). */
export function buildClaudeProjectMcpJson(mcpUrl: string, serverName: string): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        [serverName]: {
          type: "http",
          url: mcpUrl
        }
      }
    },
    null,
    2
  )}\n`;
}

/** Project-scoped `.cursor/mcp.json` snippet for Cursor teams. */
export function buildCursorProjectMcpJson(mcpUrl: string, serverName: string): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        [serverName]: {
          url: mcpUrl
        }
      }
    },
    null,
    2
  )}\n`;
}

/** Non-destructive CLI bootstrap for all supported clients. */
export function buildBootstrapCommand(workspaceSlug: string, hubOrigin: string): string {
  const slug = workspaceSlug.trim();
  const origin = hubOrigin.replace(/\/+$/, "");
  const parts = ["npx", "@tymio/mcp-server", "bootstrap", "--client", "all", "--scope", "project"];
  if (slug !== "") {
    parts.push("--slug", slug);
  }
  const cmd = parts.join(" ");
  const isDefaultHub = origin === "" || origin === "https://tymio.app";
  if (isDefaultHub) {
    return cmd;
  }
  const mcpUrl =
    slug !== "" ? `${origin}/t/${encodeURIComponent(slug)}/mcp` : `${origin}/mcp`;
  return `TYMIO_MCP_URL=${mcpUrl} ${cmd}`;
}
