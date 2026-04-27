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
      "[tymio-mcp] OAuth proxy to Tymio MCP. No MCP key in Tymio Settings — use login/OAuth. First run: `tymio-mcp login`. Root `…/mcp` is discovery-only; for backlog tools set TYMIO_MCP_URL to `…/t/<slug>/mcp` (or call tymio_list_my_workspaces on discovery). TYMIO_WORKSPACE_SLUG pins tool args. Guide: `tymio-mcp instructions` | `tymio-mcp help`\n"
    );
  } else {
    process.stderr.write(
      "[tymio-mcp] API-key REST bridge. Set TYMIO_API_BASE_URL + TYMIO_API_KEY + TYMIO_WORKSPACE_SLUG (legacy DRD_* names still work; tenant resolved to X-Tenant-Id). Agent guide: `tymio-mcp instructions`\n"
    );
  }
  const persona = activePersonaForHint();
  if (persona) {
    process.stderr.write(
      `[tymio-mcp] TYMIO_MCP_PERSONA=${persona} — persona text is appended to MCP server instructions. Print prompt: tymio-mcp persona ${persona}\n`
    );
  }
}
