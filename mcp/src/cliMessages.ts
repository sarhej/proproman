import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GUIDANCE_FILE = "TYMIO_MCP_CLI_AGENT_GUIDANCE.md";

function loadAgentGuidanceMarkdown(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const packaged = path.join(here, "..", GUIDANCE_FILE);
  try {
    if (existsSync(packaged)) return readFileSync(packaged, "utf8");
  } catch {
    /* fall through */
  }
  return [
    "# Tymio MCP CLI",
    "",
    "The guidance file `TYMIO_MCP_CLI_AGENT_GUIDANCE.md` was not found next to this package (expected beside `dist/`). Reinstall `@tymio/mcp-server` or run from the repository checkout.",
    "",
    "## Critical (read before advising the user)",
    "",
    "- **No per-user MCP API key** exists in Tymio Settings, Profile, or Account. Do not tell users to copy one from the UI.",
    "- **OAuth:** remote MCP URL `https://tymio.app/mcp` (or your host) in the IDE, or install `@tymio/mcp-server` and run `tymio-mcp login` for stdio **without** `DRD_API_KEY`/`API_KEY` on that process unless you want API-key mode.",
    "- **`DRD_API_KEY`/`API_KEY`** on the stdio process is the **server deployment** automation secret, not a personal user key.",
    "",
    "After fixing the install: `tymio-mcp instructions`",
  ].join("\n");
}

/** Short usage (stderr) — keep in sync with guidance file for agents. */
export const HELP_SUMMARY = `Tymio MCP CLI (@tymio/mcp-server)

Commands:
  tymio-mcp                    Start stdio MCP (default: OAuth → hosted Tymio MCP)
  tymio-mcp login [url]        Sign in with Google (browser). Saves tokens locally.
  tymio-mcp logout             Delete saved OAuth client + tokens
  tymio-mcp instructions       Full setup text for humans & coding agents (print this)
  tymio-mcp help               This summary

Environment:
  TYMIO_MCP_URL          Hosted MCP URL (default https://tymio.app/mcp)
  TYMIO_OAUTH_PORT       Loopback port for login callback (default 19876)
  TYMIO_MCP_QUIET        If set, suppress stderr hints when starting stdio
  DRD_API_KEY / API_KEY  If set → API-key REST tool bridge (subset), not OAuth proxy
  DRD_API_BASE_URL       Hub origin for API-key bridge (default https://tymio.app)

Critical for agents: There is NO MCP API key in Tymio user Settings — use OAuth (remote /mcp URL or tymio-mcp login).
Tip: Run  tymio-mcp instructions  for the full Markdown guide, Cursor JSON, and troubleshooting.
`;

/**
 * Long-form instructions for coding agents and operators (Markdown).
 * Loaded from `TYMIO_MCP_CLI_AGENT_GUIDANCE.md` beside the installed package / dist output.
 */
export const AGENT_INSTRUCTIONS = loadAgentGuidanceMarkdown();
