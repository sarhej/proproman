import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runSkillCommand } from "./skillCommand.js";
import { resolveSkillInstallPath } from "./skillPaths.js";

describe("resolveSkillInstallPath", () => {
  it("joins project-relative paths to cwd", () => {
    expect(resolveSkillInstallPath(".cursor/skills/x/SKILL.md", "/repo")).toBe(
      path.join("/repo", ".cursor/skills/x/SKILL.md")
    );
  });

  it("expands home-prefixed paths", () => {
    const h = path.join(os.homedir(), ".cursor/skills/x/SKILL.md");
    expect(resolveSkillInstallPath("~/.cursor/skills/x/SKILL.md", "/repo")).toBe(h);
  });
});

describe("runSkillCommand", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("list prints JSON on success", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: "tymio-workspace", version: "1", sha256: "a".repeat(64), description: "d" }]
    });
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await runSkillCommand(["list"]);
    expect(code).toBe(0);
    expect(out.mock.calls[0][0]).toMatch(/tymio-workspace/);
    out.mockRestore();
  });

  it("show prints markdown", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "# Hello skill\n"
    });
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await runSkillCommand(["show", "tymio-workspace"]);
    expect(code).toBe(0);
    expect(out.mock.calls.map((c) => String(c[0])).join("")).toMatch(/Hello skill/);
    out.mockRestore();
  });

  it("install --dry-run prints manifest", async () => {
    const manifest = {
      targetPath: ".cursor/skills/tymio-workspace/SKILL.md",
      body: "# x",
      sha256: `${"ab".repeat(32)}`,
      mode: "644"
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(manifest)
    });
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await runSkillCommand(["install", "tymio-workspace", "--dry-run"]);
    expect(code).toBe(0);
    const combined = out.mock.calls.map((c) => String(c[0])).join("");
    expect(combined).toMatch(/targetPath/);
    out.mockRestore();
  });

  it("install writes file under cwd", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "tymio-skill-"));
    try {
      const body = "# skill body\n";
      const sha = "aa".repeat(32);
      const manifest = {
        targetPath: path.join(".cursor", "skills", "tymio-test", "SKILL.md"),
        body,
        sha256: sha
      };
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(manifest)
      });
      const prev = process.cwd();
      process.chdir(tmp);
      const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const code = await runSkillCommand(["install", "tymio-test", "--client", "cursor", "--scope", "project"]);
      process.chdir(prev);
      expect(code).toBe(0);
      const written = await readFile(path.join(tmp, ".cursor/skills/tymio-test/SKILL.md"), "utf8");
      expect(written).toBe(body);
      expect(err.mock.calls.map((c) => String(c[0])).join("")).toMatch(/Wrote/);
      err.mockRestore();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("returns 1 on HTTP error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "fail"
    });
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runSkillCommand(["list"]);
    expect(code).toBe(1);
    err.mockRestore();
  });
});
