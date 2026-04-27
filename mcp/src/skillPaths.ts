import path from "node:path";
import os from "node:os";

function expandHome(p: string): string {
  if (p === "~" || p.startsWith("~/")) {
    return path.join(os.homedir(), p === "~" ? "" : p.slice(2));
  }
  return p;
}

/** Resolve install target: project-relative paths against `cwd`, `~` against home. */
export function resolveSkillInstallPath(targetPath: string, cwd: string): string {
  const expanded = expandHome(targetPath);
  if (path.isAbsolute(expanded)) return expanded;
  return path.join(cwd, expanded);
}
