import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTymioConfigDir } from "./configPaths.js";

function pkgVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const raw = fs.readFileSync(path.join(here, "..", "package.json"), "utf8");
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return "unknown";
  }
}

function maskSecret(v: string | undefined): string {
  if (!v || v.trim() === "") return "(unset)";
  const t = v.trim();
  if (t.length <= 8) return "***";
  return `${t.slice(0, 4)}…${t.slice(-2)} (${t.length} chars)`;
}

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Print diagnostics to stderr (same stream as help/instructions).
 */
export function runDoctorCommand(): void {
  const configDir = getTymioConfigDir();
  const lines: string[] = [
    "tymio-mcp doctor — environment and local config",
    "",
    `CLI version:     ${pkgVersion()}`,
    `Node.js:         ${process.version}`,
    `Config dir:      ${configDir}`,
    `oauth-client.json:  ${fileExists(path.join(configDir, "oauth-client.json")) ? "present" : "missing"}`,
    `oauth-tokens.json:    ${fileExists(path.join(configDir, "oauth-tokens.json")) ? "present" : "missing"}`,
    "",
    "Environment (non-secret hints):",
    `  TYMIO_MCP_URL          ${process.env.TYMIO_MCP_URL?.trim() || "(default https://tymio.app/mcp)"}`,
    `  TYMIO_WORKSPACE_SLUG   ${process.env.TYMIO_WORKSPACE_SLUG?.trim() || process.env.DRD_WORKSPACE_SLUG?.trim() || "(unset; required for stdio pin)"}`,
    `  TYMIO_MCP_PERSONA      ${process.env.TYMIO_MCP_PERSONA?.trim() || "(unset)"}`,
    `  TYMIO_API_KEY          ${maskSecret(process.env.TYMIO_API_KEY)}`,
    `  DRD_API_KEY (legacy)   ${maskSecret(process.env.DRD_API_KEY)}`,
    `  API_KEY                ${maskSecret(process.env.API_KEY)}`,
    `  TYMIO_API_BASE_URL     ${process.env.TYMIO_API_BASE_URL?.trim() || "(default https://tymio.app)"}`,
    "",
    "Mode: OAuth stdio proxy unless TYMIO_API_KEY / DRD_API_KEY / API_KEY is set → then API-key REST bridge.",
    "Next: tymio-mcp login  |  tymio-mcp instructions  |  tymio-mcp bootstrap --help",
    ""
  ];
  process.stderr.write(lines.join("\n"));
}
