/**
 * Deep smoke: connect to hosted Tymio MCP with saved OAuth tokens and verify tools/list.
 * Run: npm run smoke:deep --workspace mcp
 *
 * Env:
 *   TYMIO_MCP_URL           — discovery MCP URL (default https://tymio.app/mcp)
 *   TYMIO_API_BASE_URL      — hub origin when using TYMIO_SMOKE_SLUG (default https://tymio.app)
 *   TYMIO_SMOKE_SLUG / TYMIO_WORKSPACE_SLUG — if set, test …/t/<slug>/mcp instead of discovery only
 *   TYMIO_SMOKE_CALL_HEALTH — if "1" and workspace URL, call tymio_health after listTools
 */

import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { defaultMcpUrl, defaultOAuthRedirectUrl } from "./configPaths.js";
import { FileOAuthProvider } from "./fileOAuthProvider.js";

function pkgVersion(): string {
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return "1.0.0";
  }
}

const DISCOVERY_EXPECT = new Set([
  "tymio_list_my_workspaces",
  "tymio_mcp_routing_guide",
  "tymio_list_skills",
  "tymio_install_skill"
]);

/** Tools that indicate full workspace MCP (not exhaustive). */
const WORKSPACE_MARKERS = ["tymio_health", "tymio_meta", "tymio_list_initiatives"];

export function assertDiscoveryToolNames(names: Set<string>): { ok: true } | { ok: false; missing: string[] } {
  const required = ["tymio_list_my_workspaces", "tymio_mcp_routing_guide"];
  const missing = required.filter((n) => !names.has(n));
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
}

export function assertWorkspaceToolNames(names: Set<string>): { ok: true } | { ok: false; missing: string[] } {
  const missing = WORKSPACE_MARKERS.filter((n) => !names.has(n));
  if (missing.length === WORKSPACE_MARKERS.length) {
    return { ok: false, missing: WORKSPACE_MARKERS };
  }
  return { ok: true };
}

function resolveTargetUrl(): { url: URL; mode: "discovery" | "workspace"; slug?: string } {
  const slug =
    process.env.TYMIO_SMOKE_SLUG?.trim() ||
    process.env.TYMIO_WORKSPACE_SLUG?.trim() ||
    "";
  if (slug) {
    const origin = (process.env.TYMIO_API_BASE_URL ?? "https://tymio.app").replace(/\/+$/, "");
    return { url: new URL(`${origin}/t/${encodeURIComponent(slug)}/mcp`), mode: "workspace", slug };
  }
  return { url: defaultMcpUrl(), mode: "discovery" };
}

export async function runDeepSmoke(): Promise<void> {
  const { url, mode, slug } = resolveTargetUrl();
  process.stderr.write(`[deeper-smoke] MCP URL: ${url.href}\n`);
  process.stderr.write(`[deeper-smoke] mode: ${mode}${slug ? ` (slug=${slug})` : ""}\n`);

  const redirectUrl = defaultOAuthRedirectUrl();
  const provider = new FileOAuthProvider(redirectUrl);
  const transport = new StreamableHTTPClientTransport(url, { authProvider: provider });
  const client = new Client(
    { name: "@tymio/mcp-server/deeper-smoke", version: pkgVersion() },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      process.stderr.write(
        "[deeper-smoke] FAIL: not signed in or token rejected. Run: tymio-mcp login\n"
      );
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  const { tools } = await client.listTools();
  const names = new Set(tools.map((t) => t.name));
  process.stderr.write(`[deeper-smoke] tools/list count: ${tools.length}\n`);
  const preview = tools
    .slice(0, 12)
    .map((t) => t.name)
    .join(", ");
  process.stderr.write(`[deeper-smoke] sample: ${preview}${tools.length > 12 ? ", …" : ""}\n`);

  if (mode === "discovery") {
    const a = assertDiscoveryToolNames(names);
    if (!a.ok) {
      process.stderr.write(`[deeper-smoke] FAIL: discovery missing tools: ${a.missing.join(", ")}\n`);
      process.exitCode = 1;
      return;
    }
    const unexpectedBacklog = tools.filter((t) => !DISCOVERY_EXPECT.has(t.name) && t.name.startsWith("tymio_"));
    if (unexpectedBacklog.length > 0) {
      process.stderr.write(
        `[deeper-smoke] NOTE: discovery URL usually has ~4 tools; found extra tymio_* (hub may have changed).\n`
      );
    }
    process.stderr.write("[deeper-smoke] PASS: discovery tools/list looks valid.\n");
  } else {
    const a = assertWorkspaceToolNames(names);
    if (!a.ok) {
      process.stderr.write(
        `[deeper-smoke] FAIL: workspace MCP missing expected tools (need at least one of: ${WORKSPACE_MARKERS.join(", ")}).\n`
      );
      process.exitCode = 1;
      return;
    }
    process.stderr.write("[deeper-smoke] PASS: workspace tools/list includes backlog-style tools.\n");

    if (process.env.TYMIO_SMOKE_CALL_HEALTH === "1" && slug) {
      process.stderr.write("[deeper-smoke] calling tymio_health …\n");
      const result = await client.callTool({
        name: "tymio_health",
        arguments: { workspaceSlug: slug }
      });
      const text = JSON.stringify(result).slice(0, 500);
      process.stderr.write(`[deeper-smoke] tymio_health result (truncated): ${text}\n`);
      process.stderr.write("[deeper-smoke] PASS: tymio_health call completed.\n");
    }
  }

  await client.close();
}

const isMain = process.argv[1]?.includes("deeperSmoke");
if (isMain) {
  runDeepSmoke().catch((err) => {
    console.error("[deeper-smoke] ERROR:", err);
    process.exit(1);
  });
}
