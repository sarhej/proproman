import { describe, it, expect } from "vitest";
import {
  buildInstallManifest,
  skillInstallTargetPath,
  getSkillById,
  getSkillIndexRows
} from "./skillCatalog.js";

describe("skillInstallTargetPath", () => {
  const id = "tymio-workspace";

  it("cursor project vs user", () => {
    expect(skillInstallTargetPath(id, "cursor", "project")).toBe(
      ".cursor/skills/tymio-workspace/SKILL.md"
    );
    expect(skillInstallTargetPath(id, "cursor", "user")).toBe(
      "~/.cursor/skills/tymio-workspace/SKILL.md"
    );
  });

  it("claude project vs user", () => {
    expect(skillInstallTargetPath(id, "claude", "project")).toBe(
      ".claude/skills/tymio-workspace/SKILL.md"
    );
    expect(skillInstallTargetPath(id, "claude", "user")).toBe(
      "~/.claude/skills/tymio-workspace/SKILL.md"
    );
  });

  it("codex user only (project unsupported)", () => {
    expect(skillInstallTargetPath(id, "codex", "project")).toBeNull();
    expect(skillInstallTargetPath(id, "codex", "user")).toBe(
      "~/.codex/skills/codex-primary-runtime/tymio-workspace/SKILL.md"
    );
  });

  it("opencode project vs user", () => {
    expect(skillInstallTargetPath(id, "opencode", "project")).toBe(".opencode/agent/tymio-workspace.md");
    expect(skillInstallTargetPath(id, "opencode", "user")).toBe(
      "~/.config/opencode/agent/tymio-workspace.md"
    );
  });

  it("escapes path injection in id by using id verbatim (callers must validate id)", () => {
    const evil = "x/../../../etc/passwd";
    expect(skillInstallTargetPath(evil, "cursor", "project")).toBe(
      `.cursor/skills/${evil}/SKILL.md`
    );
  });
});

describe("buildInstallManifest", () => {
  it("returns ok with body and hashes for known skill", () => {
    const skill = getSkillById("tymio-workspace");
    expect(skill).toBeDefined();
    const r = buildInstallManifest("tymio-workspace", "cursor", "project");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.targetPath).toBe(".cursor/skills/tymio-workspace/SKILL.md");
      expect(r.body.length).toBeGreaterThan(100);
      expect(r.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(r.etag).toBe(r.sha256);
      expect(r.mode).toBe("644");
    }
  });

  it("unknown id returns error", () => {
    const r = buildInstallManifest("no-such-skill", "cursor", "project");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Unknown skill id/);
  });

  it("codex project returns structured error", () => {
    const r = buildInstallManifest("tymio-workspace", "codex", "project");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Codex/);
  });
});

describe("getSkillIndexRows", () => {
  it("excludes body from every row", () => {
    const rows = getSkillIndexRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toHaveProperty("body");
      expect(row.id).toMatch(/^tymio-/);
      expect(row.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("includes tymio-workspace when catalog is present", () => {
    const rows = getSkillIndexRows();
    expect(rows.some((r) => r.id === "tymio-workspace")).toBe(true);
  });
});
