import rawCatalog from "../generated/skillsCatalog.json" with { type: "json" };

export type SkillEntry = {
  id: string;
  version: string;
  sha256: string;
  description: string;
  body: string;
};

export type SkillsCatalogFile = {
  generatedAt: string;
  skills: SkillEntry[];
};

const catalog = rawCatalog as SkillsCatalogFile;

export function getSkillsCatalog(): SkillsCatalogFile {
  return catalog;
}

export type SkillIndexRow = Pick<SkillEntry, "id" | "version" | "sha256" | "description">;

export function getSkillIndexRows(): SkillIndexRow[] {
  return catalog.skills.map(({ id, version, sha256, description }) => ({
    id,
    version,
    sha256,
    description
  }));
}

export function getSkillById(id: string): SkillEntry | undefined {
  return catalog.skills.find((s) => s.id === id);
}

export type InstallClient = "cursor" | "claude" | "codex" | "opencode";
export type InstallScope = "project" | "user";

/**
 * Target path for a skill install. `null` means unsupported (Codex project scope).
 * User-scope paths use ~ for home directory (per TYMIO_BOOTSTRAP.md).
 */
export function skillInstallTargetPath(
  id: string,
  client: InstallClient,
  scope: InstallScope
): string | null {
  if (client === "codex" && scope === "project") return null;
  if (client === "cursor") {
    return scope === "project"
      ? `.cursor/skills/${id}/SKILL.md`
      : `~/.cursor/skills/${id}/SKILL.md`;
  }
  if (client === "claude") {
    return scope === "project"
      ? `.claude/skills/${id}/SKILL.md`
      : `~/.claude/skills/${id}/SKILL.md`;
  }
  if (client === "codex") {
    return `~/.codex/skills/codex-primary-runtime/${id}/SKILL.md`;
  }
  return scope === "project"
    ? `.opencode/agent/${id}.md`
    : `~/.config/opencode/agent/${id}.md`;
}

export function buildInstallManifest(
  id: string,
  client: InstallClient,
  scope: InstallScope
):
  | { ok: true; targetPath: string; body: string; mode: string; sha256: string; etag: string }
  | { ok: false; error: string } {
  const skill = getSkillById(id);
  if (!skill) {
    return { ok: false, error: `Unknown skill id: ${id}` };
  }
  const targetPath = skillInstallTargetPath(id, client, scope);
  if (!targetPath) {
    return {
      ok: false,
      error: "Codex does not support project-scoped skill installs; use scope=user."
    };
  }
  return {
    ok: true,
    targetPath,
    body: skill.body,
    mode: "644",
    sha256: skill.sha256,
    etag: skill.sha256
  };
}
