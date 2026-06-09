import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const ensureBootstrapOAuthMock = vi.hoisted(() => vi.fn());
const verifyBootstrapWorkspaceMembershipMock = vi.hoisted(() => vi.fn());
const runLoginCommandMock = vi.hoisted(() => vi.fn());

vi.mock("./bootstrap/bootstrapAuth.js", () => ({
  ensureBootstrapOAuth: ensureBootstrapOAuthMock,
  verifyBootstrapWorkspaceMembership: verifyBootstrapWorkspaceMembershipMock
}));

vi.mock("./loginCommand.js", () => ({
  runLoginCommand: runLoginCommandMock
}));

import { runBootstrapCommand } from "./bootstrapCommand.js";

describe("runBootstrapCommand", () => {
  let tmp: string;
  let prevCwd: string;
  let prevSkip: string | undefined;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tymio-boot-"));
    prevCwd = process.cwd();
    process.chdir(tmp);
    prevSkip = process.env.TYMIO_BOOTSTRAP_SKIP_AUTH;
    delete process.env.TYMIO_BOOTSTRAP_SKIP_AUTH;
    ensureBootstrapOAuthMock.mockReset();
    verifyBootstrapWorkspaceMembershipMock.mockReset();
    runLoginCommandMock.mockReset();
    ensureBootstrapOAuthMock.mockResolvedValue(true);
    verifyBootstrapWorkspaceMembershipMock.mockResolvedValue({ ok: true, workspaces: [] });
    runLoginCommandMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    process.chdir(prevCwd);
    await fs.rm(tmp, { recursive: true, force: true });
    if (prevSkip === undefined) delete process.env.TYMIO_BOOTSTRAP_SKIP_AUTH;
    else process.env.TYMIO_BOOTSTRAP_SKIP_AUTH = prevSkip;
  });

  it("prints help", async () => {
    const code = await runBootstrapCommand(["--help"]);
    expect(code).toBe(0);
    expect(ensureBootstrapOAuthMock).not.toHaveBeenCalled();
  });

  it("dry-run with slug calls auth helpers and succeeds without tokens", async () => {
    await fs.mkdir(path.join(tmp, ".cursor"), { recursive: true });
    ensureBootstrapOAuthMock.mockResolvedValue(true);
    verifyBootstrapWorkspaceMembershipMock.mockResolvedValue({ ok: true, workspaces: [] });
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await runBootstrapCommand(["--client", "cursor", "--slug", "acme", "--dry-run"]);
    expect(code).toBe(0);
    expect(ensureBootstrapOAuthMock).toHaveBeenCalledWith({
      origin: expect.any(String),
      dryRun: true,
      forceLogin: false
    });
    expect(verifyBootstrapWorkspaceMembershipMock).toHaveBeenCalledWith({
      origin: expect.any(String),
      slug: "acme",
      dryRun: true
    });
    expect(spy.mock.calls.map((c) => String(c[0])).join("")).toMatch(/dry-run/);
    expect(out.mock.calls.map((c) => String(c[0])).join("")).toMatch(/TYMIO_BOOTSTRAP ok/);
    spy.mockRestore();
    out.mockRestore();
  });

  it("returns 1 when OAuth ensure fails for slug bootstrap", async () => {
    await fs.mkdir(path.join(tmp, ".cursor"), { recursive: true });
    ensureBootstrapOAuthMock.mockResolvedValue(false);
    const code = await runBootstrapCommand(["--client", "cursor", "--slug", "acme"]);
    expect(code).toBe(1);
    expect(verifyBootstrapWorkspaceMembershipMock).not.toHaveBeenCalled();
  });

  it("returns 1 when workspace membership verification fails", async () => {
    await fs.mkdir(path.join(tmp, ".cursor"), { recursive: true });
    verifyBootstrapWorkspaceMembershipMock.mockResolvedValue({ ok: false });
    const code = await runBootstrapCommand(["--client", "cursor", "--slug", "acme"]);
    expect(code).toBe(1);
    expect(ensureBootstrapOAuthMock).toHaveBeenCalled();
    expect(verifyBootstrapWorkspaceMembershipMock).toHaveBeenCalled();
  });

  it("writes cursor config when slug auth passes", async () => {
    await fs.mkdir(path.join(tmp, ".cursor"), { recursive: true });
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await runBootstrapCommand(["--client", "cursor", "--slug", "acme"]);
    expect(code).toBe(0);
    const raw = await fs.readFile(path.join(tmp, ".cursor", "mcp.json"), "utf8");
    const parsed = JSON.parse(raw) as { mcpServers: Record<string, { url?: string }> };
    expect(Object.values(parsed.mcpServers).some((s) => s.url?.includes("/t/acme/mcp"))).toBe(true);
    out.mockRestore();
  });

  it("discovery-only bootstrap does not require slug auth", async () => {
    await fs.mkdir(path.join(tmp, ".cursor"), { recursive: true });
    const code = await runBootstrapCommand(["--client", "cursor"]);
    expect(code).toBe(0);
    expect(ensureBootstrapOAuthMock).not.toHaveBeenCalled();
    expect(verifyBootstrapWorkspaceMembershipMock).not.toHaveBeenCalled();
  });

  it("passes forceLogin to ensureBootstrapOAuth when --login with slug", async () => {
    await fs.mkdir(path.join(tmp, ".cursor"), { recursive: true });
    await runBootstrapCommand(["--client", "cursor", "--slug", "acme", "--login"]);
    expect(ensureBootstrapOAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({ forceLogin: true, dryRun: false })
    );
  });

  it("uses TYMIO_WORKSPACE_SLUG env for auth gate", async () => {
    await fs.mkdir(path.join(tmp, ".cursor"), { recursive: true });
    process.env.TYMIO_WORKSPACE_SLUG = "from-env";
    try {
      await runBootstrapCommand(["--client", "cursor"]);
      expect(ensureBootstrapOAuthMock).toHaveBeenCalled();
      expect(verifyBootstrapWorkspaceMembershipMock).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "from-env" })
      );
    } finally {
      delete process.env.TYMIO_WORKSPACE_SLUG;
    }
  });
});
