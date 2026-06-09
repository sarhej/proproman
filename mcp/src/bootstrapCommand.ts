import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { defaultMcpUrl } from "./configPaths.js";
import { hasSavedOAuthTokens } from "./fileOAuthProvider.js";
import { runLoginCommand } from "./loginCommand.js";
import { resolvePublicHubOrigin } from "./publicHubOrigin.js";
import { fetchInstallManifest, writeSkillFile } from "./skillHub.js";
import { detectClients, parseClientFlag, type BootstrapClient } from "./bootstrap/clientDetect.js";
import { hubDiscoveryMcpUrl, hubWorkspaceMcpUrl } from "./bootstrap/hubUrls.js";
import {
  buildTymioMcpPatch,
  mergeCodexConfigToml,
  mergeCursorStyleMcpServers,
  mergeOpenCodeMcp,
  type OpenCodeRemoteEntry
} from "./bootstrap/mergeMcpConfig.js";
import { writeTextFileWithBackup } from "./bootstrap/writeWithBackup.js";
import { ensureBootstrapOAuth, verifyBootstrapWorkspaceMembership } from "./bootstrap/bootstrapAuth.js";

const DEFAULT_SKILL_IDS = [
  "tymio-workspace",
  "tymio-pm-agent",
  "tymio-po-agent",
  "tymio-dev-agent"
] as const;

function configPathFor(client: BootstrapClient, scope: "project" | "user", cwd: string): string {
  const home = os.homedir();
  switch (client) {
    case "cursor":
      return scope === "project" ? path.join(cwd, ".cursor", "mcp.json") : path.join(home, ".cursor", "mcp.json");
    case "claude":
      return scope === "project" ? path.join(cwd, ".mcp.json") : path.join(home, ".claude.json");
    case "codex":
      return path.join(process.env.CODEX_HOME?.trim() || path.join(home, ".codex"), "config.toml");
    case "opencode":
      return scope === "project"
        ? path.join(cwd, "opencode.json")
        : path.join(home, ".config", "opencode", "opencode.json");
  }
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function applyOneClient(
  client: BootstrapClient,
  scope: "project" | "user",
  cwd: string,
  discoveryUrl: string,
  workspaceUrl: string | null,
  slug: string | null,
  force: boolean,
  dryRun: boolean
): Promise<{ ok: boolean; message: string }> {
  const filePath = configPathFor(client, scope, cwd);

  if (client === "codex") {
    const mcpUrl = workspaceUrl ?? discoveryUrl;
    const prev = await fs.readFile(filePath, "utf8").catch(() => "");
    const next = mergeCodexConfigToml(prev, mcpUrl);
    if (dryRun) {
      return { ok: true, message: `[dry-run] would write ${filePath}` };
    }
    const wrote = await writeTextFileWithBackup(filePath, next);
    return { ok: true, message: wrote ? `updated Codex: ${filePath}` : `unchanged Codex: ${filePath}` };
  }

  const prev = await readJsonObject(filePath);
  if (client === "opencode") {
    const patch = buildTymioMcpPatch(
      "opencode",
      discoveryUrl,
      workspaceUrl,
      slug
    ) as Record<string, OpenCodeRemoteEntry>;
    const { next, conflict } = mergeOpenCodeMcp(prev, patch, force);
    if (conflict) return { ok: false, message: `${filePath}: ${conflict}` };
    const out = `${JSON.stringify(next, null, 2)}\n`;
    if (dryRun) return { ok: true, message: `[dry-run] would write ${filePath}` };
    const wrote = await writeTextFileWithBackup(filePath, out);
    return { ok: true, message: wrote ? `updated OpenCode: ${filePath}` : `unchanged OpenCode: ${filePath}` };
  }

  const patch = buildTymioMcpPatch(client, discoveryUrl, workspaceUrl, slug);
  const { next, conflict } = mergeCursorStyleMcpServers(prev, patch, force);
  if (conflict) return { ok: false, message: `${filePath}: ${conflict}` };
  const out = `${JSON.stringify(next, null, 2)}\n`;
  if (dryRun) return { ok: true, message: `[dry-run] would write ${filePath}` };
  const wrote = await writeTextFileWithBackup(filePath, out);
  return { ok: true, message: wrote ? `updated ${client}: ${filePath}` : `unchanged ${client}: ${filePath}` };
}

function helpText(): string {
  return `tymio-mcp bootstrap — non-destructive MCP config for Cursor, Claude Code, Codex, OpenCode

Writes only \`tymio-*\` keys under mcpServers / mcp (see docs/TYMIO_BOOTSTRAP.md). Backs up before replace.

Usage:
  tymio-mcp bootstrap [options]

Options:
  --client <cursor|claude|codex|opencode|all>   Default: auto-detect (fails if ambiguous)
  --slug <workspace-slug>                        Workspace MCP URL (…/t/<slug>/mcp); else env TYMIO_WORKSPACE_SLUG
  --scope <project|user>                       Config file location (default: project). Codex ignores (user global only)
  --force                                      Overwrite differing existing tymio-* url values
  --dry-run                                    Print actions only
  --login                                      Force browser OAuth before verifying --slug (re-sign-in / switch account)
  --skills                                     Install default hub skills (${DEFAULT_SKILL_IDS.join(", ")})

When --slug (or TYMIO_WORKSPACE_SLUG) is set, bootstrap requires OAuth and verifies ACTIVE
membership via tymio_list_my_workspaces before writing a workspace MCP URL. Run tymio-mcp logout
then bootstrap --login to switch Google accounts.

Afterwards: restart the IDE / OpenCode; use a workspace MCP URL for full tymio_* tools.
`;
}

export async function runBootstrapCommand(args: string[]): Promise<number> {
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help" || args[0] === "help") {
    process.stderr.write(helpText());
    return 0;
  }

  let clientArg: string | undefined;
  let slug: string | undefined;
  let scope: "project" | "user" = "project";
  let force = false;
  let dryRun = false;
  let doLogin = false;
  let installSkills = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--force") {
      force = true;
      continue;
    }
    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (a === "--login") {
      doLogin = true;
      continue;
    }
    if (a === "--skills") {
      installSkills = true;
      continue;
    }
    if (a === "--client" && args[i + 1]) {
      clientArg = args[++i];
      continue;
    }
    if (a === "--slug" && args[i + 1]) {
      slug = args[++i].trim();
      continue;
    }
    if (a === "--scope" && args[i + 1]) {
      const s = args[++i];
      if (s !== "project" && s !== "user") {
        process.stderr.write(`Invalid --scope: ${s}\n`);
        return 1;
      }
      scope = s;
      continue;
    }
    process.stderr.write(`Unknown argument: ${a}\nRun: tymio-mcp bootstrap --help\n`);
    return 1;
  }

  const cwd = process.cwd();
  const origin = resolvePublicHubOrigin();
  const discoveryUrl = hubDiscoveryMcpUrl(origin);
  const slugResolved = slug?.trim() || process.env.TYMIO_WORKSPACE_SLUG?.trim() || null;
  const workspaceUrl = slugResolved ? hubWorkspaceMcpUrl(origin, slugResolved) : null;

  if (slugResolved) {
    if (!(await ensureBootstrapOAuth({ origin, dryRun, forceLogin: doLogin }))) {
      return 1;
    }
    const membership = await verifyBootstrapWorkspaceMembership({
      origin,
      slug: slugResolved,
      dryRun
    });
    if (!membership.ok) {
      return 1;
    }
  } else if (doLogin) {
    if (!hasSavedOAuthTokens()) {
      if (dryRun) {
        process.stderr.write("[dry-run] would run tymio-mcp login\n");
      } else {
        process.stderr.write("Running OAuth login…\n");
        await runLoginCommand(defaultMcpUrl());
      }
    } else {
      process.stderr.write("OAuth tokens already cached (discovery-only bootstrap; use --login to re-sign-in).\n");
    }
  }

  let clients: BootstrapClient[];
  const parsed = clientArg ? parseClientFlag(clientArg) : null;
  if (clientArg && !parsed) {
    process.stderr.write(`Invalid --client: ${clientArg}\n`);
    return 1;
  }
  if (parsed === "all") {
    clients = detectClients(cwd);
    if (clients.length === 0) {
      process.stderr.write("No clients detected. Open a project with .cursor / .claude / opencode.json or pass --client.\n");
      return 1;
    }
  } else if (parsed) {
    clients = [parsed];
  } else {
    const d = detectClients(cwd);
    if (d.length === 0) {
      process.stderr.write(
        "No agent client detected in this directory. Pass --client <cursor|claude|codex|opencode|all>\n"
      );
      return 1;
    }
    if (d.length > 1) {
      process.stderr.write(
        `Multiple clients detected (${d.join(", ")}). Pass --client <name|all> to choose.\n`
      );
      return 1;
    }
    clients = d;
  }

  const messages: string[] = [];
  for (const c of clients) {
    const r = await applyOneClient(c, scope, cwd, discoveryUrl, workspaceUrl, slugResolved, force, dryRun);
    if (!r.ok) {
      process.stderr.write(`${r.message}\n`);
      return 1;
    }
    messages.push(r.message);
  }

  for (const m of messages) {
    process.stderr.write(`${m}\n`);
  }

  if (installSkills && !dryRun) {
    const primary = clients[0] ?? "cursor";
    for (const sid of DEFAULT_SKILL_IDS) {
      const r = await fetchInstallManifest(origin, sid, primary, scope);
      if (!r.ok) {
        process.stderr.write(`skill ${sid}: ${r.error}\n`);
        continue;
      }
      await writeSkillFile(r.data, cwd);
      process.stderr.write(`skill installed: ${sid}\n`);
    }
  } else if (installSkills && dryRun) {
    process.stderr.write(`[dry-run] would install skills: ${DEFAULT_SKILL_IDS.join(", ")}\n`);
  }

  const pin = slugResolved ? `slug=${slugResolved}` : "slug=(discovery only — pass --slug for full tools)";
  process.stdout.write(`TYMIO_BOOTSTRAP ok ${pin} clients=${clients.join(",")} oauth=${hasSavedOAuthTokens() ? "cached" : "none"}\n`);
  return 0;
}
