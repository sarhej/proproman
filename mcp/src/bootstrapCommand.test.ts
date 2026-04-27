import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runBootstrapCommand } from "./bootstrapCommand.js";

describe("runBootstrapCommand", () => {
  let tmp: string;
  let prevCwd: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tymio-boot-"));
    prevCwd = process.cwd();
    process.chdir(tmp);
  });

  afterEach(async () => {
    process.chdir(prevCwd);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("prints help", async () => {
    const code = await runBootstrapCommand(["--help"]);
    expect(code).toBe(0);
  });

  it("dry-run configures cursor with slug", async () => {
    await fs.mkdir(path.join(tmp, ".cursor"), { recursive: true });
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await runBootstrapCommand(["--client", "cursor", "--slug", "acme", "--dry-run"]);
    expect(code).toBe(0);
    expect(spy.mock.calls.map((c) => String(c[0])).join("")).toMatch(/dry-run/);
    expect(out.mock.calls.map((c) => String(c[0])).join("")).toMatch(/TYMIO_BOOTSTRAP ok/);
    spy.mockRestore();
    out.mockRestore();
  });
});
