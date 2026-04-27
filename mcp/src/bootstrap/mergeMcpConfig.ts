import type { BootstrapClient } from "./clientDetect.js";

export type McpUrlEntry = { url: string };

export type OpenCodeRemoteEntry = { type: "remote"; url: string; enabled?: boolean };

/**
 * Merge only `tymio-*` keys under `mcpServers`. Preserves all other server keys.
 * Returns `null` if nothing changed (idempotent).
 */
export function mergeCursorStyleMcpServers(
  existing: Record<string, unknown>,
  tymioPatch: Record<string, McpUrlEntry>,
  force: boolean
): { next: Record<string, unknown>; conflict: string | null } {
  const root = { ...existing };
  const servers = {
    ...((root.mcpServers as Record<string, unknown> | undefined) ?? {})
  } as Record<string, unknown>;
  let conflict: string | null = null;

  for (const [key, proposed] of Object.entries(tymioPatch)) {
    if (!key.startsWith("tymio-")) continue;
    const prev = servers[key] as Record<string, unknown> | undefined;
    const prevUrl = prev && typeof prev.url === "string" ? prev.url.trim() : undefined;
    const nextUrl = proposed.url.trim();
    if (prevUrl !== undefined && prevUrl !== nextUrl && !force) {
      conflict = `Key "${key}": existing url differs (${prevUrl}) from proposed (${nextUrl}). Use --force to replace.`;
      break;
    }
    if (JSON.stringify(prev) !== JSON.stringify({ url: nextUrl })) {
      servers[key] = { url: nextUrl };
    }
  }

  if (conflict) return { next: root, conflict };

  root.mcpServers = servers;
  return { next: root, conflict: null };
}

/** OpenCode `mcp` map merge (tymio-* keys only). */
export function mergeOpenCodeMcp(
  existing: Record<string, unknown>,
  tymioPatch: Record<string, OpenCodeRemoteEntry>,
  force: boolean
): { next: Record<string, unknown>; conflict: string | null } {
  const root = { ...existing };
  const mcp = { ...((root.mcp as Record<string, unknown> | undefined) ?? {}) } as Record<string, unknown>;
  let conflict: string | null = null;

  for (const [key, proposed] of Object.entries(tymioPatch)) {
    if (!key.startsWith("tymio-")) continue;
    const prev = mcp[key] as Record<string, unknown> | undefined;
    const prevUrl = prev && typeof prev.url === "string" ? prev.url.trim() : undefined;
    const nextUrl = proposed.url.trim();
    if (prevUrl !== undefined && prevUrl !== nextUrl && !force) {
      conflict = `Key "${key}": existing url differs. Use --force to replace.`;
      break;
    }
    if (JSON.stringify(prev) !== JSON.stringify(proposed)) {
      mcp[key] = { ...proposed, enabled: proposed.enabled ?? true };
    }
  }

  if (conflict) return { next: root, conflict };

  root.mcp = mcp;
  if (root.$schema === undefined) {
    root.$schema = "https://opencode.ai/config.json";
  }
  return { next: root, conflict: null };
}

export function buildTymioMcpPatch(
  client: BootstrapClient,
  discoveryUrl: string,
  workspaceUrl: string | null,
  slug: string | null
): Record<string, McpUrlEntry> | Record<string, OpenCodeRemoteEntry> {
  const patch: Record<string, McpUrlEntry> = {
    "tymio-discovery": { url: discoveryUrl }
  };
  if (workspaceUrl && slug) {
    patch[`tymio-${slug}`] = { url: workspaceUrl };
  }
  if (client === "opencode") {
    const o: Record<string, OpenCodeRemoteEntry> = {};
    for (const [k, v] of Object.entries(patch)) {
      o[k] = { type: "remote", url: v.url, enabled: true };
    }
    return o;
  }
  return patch;
}

/** Replace or append Codex `[mcp_servers.tymio]` block (stdio CLI; OAuth via env on the process). */
export function mergeCodexConfigToml(existing: string, workspaceMcpUrl: string, persona = "workspace"): string {
  const block = `[mcp_servers.tymio]
command = "npx"
args = ["-y", "@tymio/mcp-server"]
env = { TYMIO_MCP_URL = "${workspaceMcpUrl.replace(/"/g, '\\"')}", TYMIO_MCP_PERSONA = "${persona}" }
`;
  if (existing.includes("[mcp_servers.tymio]")) {
    return existing.replace(/\[mcp_servers\.tymio\][\s\S]*?(?=\n\[|\n?$)/m, block.trimEnd());
  }
  const base = existing.trimEnd();
  return `${base}${base ? "\n\n" : ""}${block}\n`;
}
