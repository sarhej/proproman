import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const FILE = "TYMIO_MCP_CLI_AGENT_GUIDANCE.md";

/**
 * Load the same Markdown the `@tymio/mcp-server` package ships (repo: mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md).
 * Production Docker image copies that file under `mcp/` relative to process cwd (`/app`).
 */
export function readTymioMcpCliAgentGuidanceMarkdown(): string {
  const candidates = [
    path.join(process.cwd(), "mcp", FILE),
    path.join(process.cwd(), "..", "mcp", FILE),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      return readFileSync(p, "utf8");
    } catch {
      /* try next */
    }
  }
  return "";
}
