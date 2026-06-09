import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { withTempXdgConfig } from "../test/helpers.js";

const runLoginCommandMock = vi.hoisted(() => vi.fn());
const fetchMyWorkspacesViaMcpMock = vi.hoisted(() => vi.fn());

vi.mock("../loginCommand.js", () => ({
  runLoginCommand: runLoginCommandMock
}));

vi.mock("./listMyWorkspaces.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./listMyWorkspaces.js")>();
  return {
    ...actual,
    fetchMyWorkspacesViaMcp: fetchMyWorkspacesViaMcpMock
  };
});

import {
  ensureBootstrapOAuth,
  isBootstrapAuthSkipped,
  verifyBootstrapWorkspaceMembership
} from "./bootstrapAuth.js";
import { getTymioConfigDir } from "../configPaths.js";

function writeTokens(): void {
  const dir = getTymioConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "oauth-tokens.json"),
    JSON.stringify({ access_token: "at-test", token_type: "Bearer" }),
    "utf8"
  );
}

describe("bootstrapAuth", () => {
  let ctx: ReturnType<typeof withTempXdgConfig>;

  beforeEach(() => {
    ctx = withTempXdgConfig();
    runLoginCommandMock.mockReset();
    fetchMyWorkspacesViaMcpMock.mockReset();
    delete process.env.TYMIO_BOOTSTRAP_SKIP_AUTH;
    runLoginCommandMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    ctx.cleanup();
  });

  describe("ensureBootstrapOAuth", () => {
    it("returns true when tokens already cached", async () => {
      writeTokens();
      const ok = await ensureBootstrapOAuth({ origin: "https://tymio.app", dryRun: false, forceLogin: false });
      expect(ok).toBe(true);
      expect(runLoginCommandMock).not.toHaveBeenCalled();
    });

    it("runs login when slug bootstrap needs tokens", async () => {
      runLoginCommandMock.mockImplementation(async () => {
        writeTokens();
      });
      const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const ok = await ensureBootstrapOAuth({ origin: "https://tymio.app", dryRun: false, forceLogin: false });
      expect(ok).toBe(true);
      expect(runLoginCommandMock).toHaveBeenCalledOnce();
      expect(err.mock.calls.map((c) => String(c[0])).join("")).toMatch(/required before pinning/);
      err.mockRestore();
    });

    it("fails when login does not persist tokens", async () => {
      const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const ok = await ensureBootstrapOAuth({ origin: "https://tymio.app", dryRun: false, forceLogin: false });
      expect(ok).toBe(false);
      expect(runLoginCommandMock).toHaveBeenCalledOnce();
      err.mockRestore();
    });

    it("dry-run skips login but prints would-run message", async () => {
      const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const ok = await ensureBootstrapOAuth({ origin: "https://tymio.app", dryRun: true, forceLogin: false });
      expect(ok).toBe(true);
      expect(runLoginCommandMock).not.toHaveBeenCalled();
      expect(err.mock.calls.map((c) => String(c[0])).join("")).toMatch(/\[dry-run\] would run tymio-mcp login/);
      err.mockRestore();
    });

    it("forceLogin runs login even when tokens exist", async () => {
      writeTokens();
      const ok = await ensureBootstrapOAuth({ origin: "https://hub.test", dryRun: false, forceLogin: true });
      expect(ok).toBe(true);
      expect(runLoginCommandMock).toHaveBeenCalledOnce();
      expect(runLoginCommandMock.mock.calls[0][0].href).toBe("https://hub.test/mcp");
    });

    it("respects TYMIO_BOOTSTRAP_SKIP_AUTH", async () => {
      process.env.TYMIO_BOOTSTRAP_SKIP_AUTH = "1";
      expect(isBootstrapAuthSkipped()).toBe(true);
      const ok = await ensureBootstrapOAuth({ origin: "https://tymio.app", dryRun: false, forceLogin: false });
      expect(ok).toBe(true);
      expect(runLoginCommandMock).not.toHaveBeenCalled();
    });
  });

  describe("verifyBootstrapWorkspaceMembership", () => {
    it("accepts slug present in membership list", async () => {
      writeTokens();
      fetchMyWorkspacesViaMcpMock.mockResolvedValue([
        { slug: "acme", name: "Acme", streamableHttpMcpUrl: "https://x/t/acme/mcp" }
      ]);
      const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const r = await verifyBootstrapWorkspaceMembership({
        origin: "https://tymio.app",
        slug: "acme",
        dryRun: false
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.workspaces[0].slug).toBe("acme");
      expect(err.mock.calls.map((c) => String(c[0])).join("")).toMatch(/OAuth OK — workspace "acme"/);
      err.mockRestore();
    });

    it("matches slug case-insensitively", async () => {
      writeTokens();
      fetchMyWorkspacesViaMcpMock.mockResolvedValue([
        { slug: "Acme", name: "Acme", streamableHttpMcpUrl: "https://x/t/Acme/mcp" }
      ]);
      const r = await verifyBootstrapWorkspaceMembership({
        origin: "https://tymio.app",
        slug: "acme",
        dryRun: false
      });
      expect(r.ok).toBe(true);
    });

    it("rejects slug not in membership list", async () => {
      writeTokens();
      fetchMyWorkspacesViaMcpMock.mockResolvedValue([
        { slug: "other", name: "Other", streamableHttpMcpUrl: "https://x/t/other/mcp" }
      ]);
      const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const r = await verifyBootstrapWorkspaceMembership({
        origin: "https://tymio.app",
        slug: "acme",
        dryRun: false
      });
      expect(r.ok).toBe(false);
      expect(err.mock.calls.map((c) => String(c[0])).join("")).toMatch(/Bootstrap refused/);
      expect(err.mock.calls.map((c) => String(c[0])).join("")).toMatch(/Your workspaces: other/);
      err.mockRestore();
    });

    it("rejects when user has no workspaces", async () => {
      writeTokens();
      fetchMyWorkspacesViaMcpMock.mockResolvedValue([]);
      const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const r = await verifyBootstrapWorkspaceMembership({
        origin: "https://tymio.app",
        slug: "acme",
        dryRun: false
      });
      expect(r.ok).toBe(false);
      expect(err.mock.calls.map((c) => String(c[0])).join("")).toMatch(/Your workspaces: \(none\)/);
      err.mockRestore();
    });

    it("fails on UnauthorizedError from MCP", async () => {
      writeTokens();
      fetchMyWorkspacesViaMcpMock.mockRejectedValue(new UnauthorizedError("expired"));
      const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const r = await verifyBootstrapWorkspaceMembership({
        origin: "https://tymio.app",
        slug: "acme",
        dryRun: false
      });
      expect(r.ok).toBe(false);
      expect(err.mock.calls.map((c) => String(c[0])).join("")).toMatch(/OAuth session expired/);
      err.mockRestore();
    });

    it("dry-run without tokens skips MCP call", async () => {
      const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const r = await verifyBootstrapWorkspaceMembership({
        origin: "https://tymio.app",
        slug: "acme",
        dryRun: true
      });
      expect(r.ok).toBe(true);
      expect(fetchMyWorkspacesViaMcpMock).not.toHaveBeenCalled();
      expect(err.mock.calls.map((c) => String(c[0])).join("")).toMatch(/would verify ACTIVE membership/);
      err.mockRestore();
    });

    it("dry-run with tokens still verifies membership", async () => {
      writeTokens();
      fetchMyWorkspacesViaMcpMock.mockResolvedValue([
        { slug: "acme", name: "Acme", streamableHttpMcpUrl: "https://x/t/acme/mcp" }
      ]);
      const r = await verifyBootstrapWorkspaceMembership({
        origin: "https://tymio.app",
        slug: "acme",
        dryRun: true
      });
      expect(r.ok).toBe(true);
      expect(fetchMyWorkspacesViaMcpMock).toHaveBeenCalledOnce();
    });
  });
});
