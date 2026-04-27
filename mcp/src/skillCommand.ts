import fs from "node:fs/promises";
import {
  fetchInstallManifest,
  fetchSkillIndex,
  removeSkillFile,
  sha256Utf8,
  writeSkillFile
} from "./skillHub.js";
import { resolvePublicHubOrigin } from "./publicHubOrigin.js";
import { resolveSkillInstallPath } from "./skillPaths.js";

export { resolveSkillInstallPath } from "./skillPaths.js";

async function fetchText(origin: string, pathname: string): Promise<string> {
  const url = `${origin}${pathname}`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status} ${url}: ${t || res.statusText}`);
  }
  return res.text();
}

function helpText(): string {
  return `tymio-mcp skill — fetch published skills from the hub (public HTTP)

Commands:
  tymio-mcp skill list                      Print JSON catalog (id, version, sha256, description)
  tymio-mcp skill show <id>                 Print canonical SKILL.md to stdout
  tymio-mcp skill install <id> [options]    Fetch manifest and write SKILL file (with backup)
  tymio-mcp skill update [<id> | --all]     Re-download if hub sha256 differs from local file
  tymio-mcp skill remove <id> [options]      Remove installed skill file for client/scope

Options (install / update / remove):
  --client <cursor|claude|codex|opencode>     Default: cursor
  --scope <project|user>                    Default: project

Options (install / update only):
  --dry-run                                   Print manifest or skip writes

Options (update only):
  --all                                       Update every skill that has a local file at the default path

Environment:
  TYMIO_API_BASE_URL   Hub origin for /skills (default: derive from TYMIO_MCP_URL or https://tymio.app)
  TYMIO_MCP_URL        Used only to infer origin when TYMIO_API_BASE_URL is unset
`;
}

export async function runSkillCommand(args: string[]): Promise<number> {
  const sub = args[0];
  if (!sub || sub === "-h" || sub === "--help" || sub === "help") {
    process.stderr.write(`${helpText()}\n`);
    return 0;
  }

  const origin = resolvePublicHubOrigin();
  const cwd = process.cwd();

  try {
    if (sub === "list") {
      const rows = await fetchSkillIndex(origin);
      process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
      return 0;
    }

    if (sub === "show") {
      const id = args[1]?.trim();
      if (!id) {
        process.stderr.write("Usage: tymio-mcp skill show <id>\n");
        return 1;
      }
      const md = await fetchText(origin, `/skills/${encodeURIComponent(id)}.md`);
      process.stdout.write(md);
      if (!md.endsWith("\n")) process.stdout.write("\n");
      return 0;
    }

    if (sub === "install") {
      const id = args[1]?.trim();
      if (!id) {
        process.stderr.write("Usage: tymio-mcp skill install <id> [--client …] [--scope …] [--dry-run]\n");
        return 1;
      }
      let client = "cursor";
      let scope: "project" | "user" = "project";
      let dryRun = false;
      for (let i = 2; i < args.length; i++) {
        const a = args[i];
        if (a === "--dry-run") {
          dryRun = true;
          continue;
        }
        if (a === "--client" && args[i + 1]) {
          client = args[++i];
          continue;
        }
        if (a === "--scope" && args[i + 1]) {
          const s = args[++i];
          if (s !== "project" && s !== "user") {
            process.stderr.write(`Invalid --scope (use project|user): ${s}\n`);
            return 1;
          }
          scope = s;
          continue;
        }
        process.stderr.write(`Unknown argument: ${a}\n`);
        return 1;
      }
      if (!["cursor", "claude", "codex", "opencode"].includes(client)) {
        process.stderr.write(`Invalid --client: ${client}\n`);
        return 1;
      }

      const r = await fetchInstallManifest(origin, id, client, scope);
      if (!r.ok) {
        process.stderr.write(`${r.error}\n`);
        return 1;
      }
      if (dryRun) {
        process.stdout.write(`${JSON.stringify(r.data, null, 2)}\n`);
        return 0;
      }
      const { dest, changed } = await writeSkillFile(r.data, cwd);
      if (!changed) {
        process.stderr.write(`Up to date: ${dest}\n`);
      } else {
        process.stderr.write(`Wrote ${dest} (${r.data.sha256.slice(0, 8)}…)\n`);
      }
      return 0;
    }

    if (sub === "update") {
      const tail = args.slice(1);
      const isAll = tail.includes("--all");
      let client = "cursor";
      let scope: "project" | "user" = "project";
      let dryRun = false;
      const pos: string[] = [];
      for (let i = 0; i < tail.length; i++) {
        const a = tail[i];
        if (a === "--all") continue;
        if (a === "--dry-run") {
          dryRun = true;
          continue;
        }
        if (a === "--client" && tail[i + 1]) {
          client = tail[++i];
          continue;
        }
        if (a === "--scope" && tail[i + 1]) {
          const s = tail[++i];
          if (s !== "project" && s !== "user") {
            process.stderr.write(`Invalid --scope (use project|user): ${s}\n`);
            return 1;
          }
          scope = s;
          continue;
        }
        if (a.startsWith("-")) {
          process.stderr.write(`Unknown argument: ${a}\n`);
          return 1;
        }
        pos.push(a);
      }
      if (!["cursor", "claude", "codex", "opencode"].includes(client)) {
        process.stderr.write(`Invalid --client: ${client}\n`);
        return 1;
      }

      if (isAll) {
        const index = await fetchSkillIndex(origin);
        let n = 0;
        for (const row of index) {
          const r = await fetchInstallManifest(origin, row.id, client, scope);
          if (!r.ok) continue;
          const dest = resolveSkillInstallPath(r.data.targetPath, cwd);
          try {
            const prev = await fs.readFile(dest, "utf8");
            if (sha256Utf8(prev) === row.sha256) continue;
          } catch {
            continue;
          }
          if (dryRun) {
            process.stdout.write(`would update ${row.id} -> ${dest}\n`);
            n++;
            continue;
          }
          const w = await writeSkillFile(r.data, cwd);
          if (w.changed) {
            process.stderr.write(`Updated ${row.id} -> ${w.dest}\n`);
            n++;
          }
        }
        process.stderr.write(`tymio-mcp skill update --all: ${n} file(s) changed or would change.\n`);
        return 0;
      }

      const id = pos[0]?.trim();
      if (!id) {
        process.stderr.write("Usage: tymio-mcp skill update <id> [options]  |  tymio-mcp skill update --all [options]\n");
        return 1;
      }

      const index = await fetchSkillIndex(origin);
      const row = index.find((x) => x.id === id);
      if (!row) {
        process.stderr.write(`Unknown skill id: ${id}\n`);
        return 1;
      }
      const r = await fetchInstallManifest(origin, id, client, scope);
      if (!r.ok) {
        process.stderr.write(`${r.error}\n`);
        return 1;
      }
      try {
        const prev = await fs.readFile(resolveSkillInstallPath(r.data.targetPath, cwd), "utf8");
        if (sha256Utf8(prev) === row.sha256) {
          process.stderr.write(`Up to date: ${id}\n`);
          return 0;
        }
      } catch {
        /* fresh install */
      }
      if (dryRun) {
        process.stdout.write(`${JSON.stringify(r.data, null, 2)}\n`);
        return 0;
      }
      const { dest, changed } = await writeSkillFile(r.data, cwd);
      process.stderr.write(changed ? `Updated ${dest}\n` : `${dest} unchanged\n`);
      return 0;
    }

    if (sub === "remove") {
      const id = args[1]?.trim();
      if (!id) {
        process.stderr.write("Usage: tymio-mcp skill remove <id> [--client …] [--scope …]\n");
        return 1;
      }
      let client = "cursor";
      let scope: "project" | "user" = "project";
      for (let i = 2; i < args.length; i++) {
        const a = args[i];
        if (a === "--client" && args[i + 1]) {
          client = args[++i];
          continue;
        }
        if (a === "--scope" && args[i + 1]) {
          const s = args[++i];
          if (s !== "project" && s !== "user") {
            process.stderr.write(`Invalid --scope (use project|user): ${s}\n`);
            return 1;
          }
          scope = s;
          continue;
        }
        process.stderr.write(`Unknown argument: ${a}\n`);
        return 1;
      }
      if (!["cursor", "claude", "codex", "opencode"].includes(client)) {
        process.stderr.write(`Invalid --client: ${client}\n`);
        return 1;
      }
      const r = await fetchInstallManifest(origin, id, client, scope);
      if (!r.ok) {
        process.stderr.write(`${r.error}\n`);
        return 1;
      }
      const { dest, removed } = await removeSkillFile(r.data.targetPath, cwd);
      if (!removed) {
        process.stderr.write(`Not found (nothing to remove): ${dest}\n`);
        return 1;
      }
      process.stderr.write(`Removed ${dest}\n`);
      return 0;
    }

    process.stderr.write(`Unknown skill subcommand: ${sub}\n${helpText()}`);
    return 1;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`tymio-mcp skill: ${msg}\n`);
    return 1;
  }
}
