import { activePersonaForHint } from "./persona.js";

/**
 * One-line stderr hint when starting stdio (does not touch stdout — MCP JSON-RPC stays clean).
 * Suppress with TYMIO_MCP_QUIET=1 or non-TTY stderr.
 */
export function writeStdioStartupHint(mode: "oauth" | "api-key"): void {
  if (process.env.TYMIO_MCP_QUIET) return;
  if (!process.stderr.isTTY) return;
  if (mode === "oauth") {
    process.stderr.write(
      "[tymio-mcp] OAuth proxy to Tymio MCP. No MCP key in Tymio Settings — use login/OAuth. First run: `tymio-mcp login`. Set TYMIO_WORKSPACE_SLUG (or DRD_WORKSPACE_SLUG) to pin this server to one workspace. Guide: `tymio-mcp instructions` | `tymio-mcp help`\n"
    );
  } else {
    process.stderr.write(
      "[tymio-mcp] API-key REST bridge. Set DRD_API_BASE_URL + DRD_API_KEY + TYMIO_WORKSPACE_SLUG (tenant resolved to X-Tenant-Id). Agent guide: `tymio-mcp instructions`\n"
    );
  }
  const persona = activePersonaForHint();
  if (persona) {
    process.stderr.write(
      `[tymio-mcp] TYMIO_MCP_PERSONA=${persona} — persona text is appended to MCP server instructions. Print prompt: tymio-mcp persona ${persona}\n`
    );
  }
}
