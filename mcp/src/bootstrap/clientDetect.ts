import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type BootstrapClient = "cursor" | "claude" | "codex" | "opencode";

/** Heuristic detection of which agent clients are relevant for the current cwd (see docs/TYMIO_BOOTSTRAP.md). */
export function detectClients(cwd: string, env: NodeJS.ProcessEnv = process.env): BootstrapClient[] {
  const found = new Set<BootstrapClient>();

  if (
    fs.existsSync(path.join(cwd, ".cursor")) ||
    Boolean(env.CURSOR_SESSION?.trim()) ||
    Boolean(env.CURSOR_TRACE_ID?.trim())
  ) {
    found.add("cursor");
  }

  if (
    fs.existsSync(path.join(cwd, ".claude")) ||
    fs.existsSync(path.join(cwd, "CLAUDE.md")) ||
    Boolean(env.CLAUDECODE_ENTRYPOINT?.trim())
  ) {
    found.add("claude");
  }

  const codexHome = env.CODEX_HOME?.trim();
  const codexToml = path.join(codexHome ? codexHome : path.join(os.homedir(), ".codex"), "config.toml");
  if (codexHome || fs.existsSync(codexToml)) {
    found.add("codex");
  }

  if (fs.existsSync(path.join(cwd, "opencode.json")) || Object.keys(env).some((k) => k.startsWith("OPENCODE_"))) {
    found.add("opencode");
  }

  return [...found];
}

export function parseClientFlag(value: string): BootstrapClient | "all" | null {
  const v = value.toLowerCase().trim();
  if (v === "all") return "all";
  if (v === "cursor" || v === "claude" || v === "codex" || v === "opencode") return v;
  return null;
}
