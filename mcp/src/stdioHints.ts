/**
 * One-line stderr hint when starting stdio (does not touch stdout — MCP JSON-RPC stays clean).
 * Suppress with TYMIO_MCP_QUIET=1 or non-TTY stderr.
 */
export function writeStdioStartupHint(mode: "oauth" | "api-key"): void {
  if (process.env.TYMIO_MCP_QUIET) return;
  if (!process.stderr.isTTY) return;
  if (mode === "oauth") {
    process.stderr.write(
      "[tymio-mcp] OAuth proxy to Tymio MCP. No MCP key in Tymio Settings — use login/OAuth. First run: `tymio-mcp login`. Guide: `tymio-mcp instructions` | `tymio-mcp help`\n"
    );
  } else {
    process.stderr.write(
      "[tymio-mcp] API-key REST bridge. Set DRD_API_BASE_URL + DRD_API_KEY. Agent guide: `tymio-mcp instructions`\n"
    );
  }
}
