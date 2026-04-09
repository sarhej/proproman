import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** XDG-style config directory for OAuth tokens and dynamic client registration. */
export function getTymioConfigDir(): string {
  const base =
    process.env.XDG_CONFIG_HOME ?? (process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support") : path.join(os.homedir(), ".config"));
  return path.join(base, "tymio-mcp");
}

export function ensureConfigDir(): string {
  const dir = getTymioConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function defaultMcpUrl(): URL {
  const raw = (process.env.TYMIO_MCP_URL ?? "https://tymio.app/mcp").trim();
  const fallback = "https://tymio.app/mcp";
  const base = raw.length > 0 ? raw : fallback;
  const trimmed = base.replace(/\/+$/, "");
  const withMcp = trimmed.endsWith("/mcp") ? trimmed : `${trimmed}/mcp`;
  return new URL(withMcp);
}

/** Loopback redirect port for OAuth `login` (must stay stable across runs for dynamic client registration). */
export function defaultOAuthRedirectUrl(): URL {
  const raw = process.env.TYMIO_OAUTH_PORT;
  let port = 19876;
  if (raw !== undefined && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= 65535) port = n;
  }
  return new URL(`http://127.0.0.1:${port}/callback`);
}
