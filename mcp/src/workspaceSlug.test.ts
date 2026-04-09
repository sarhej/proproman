import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertToolArgsMatchPinnedWorkspace,
  isValidWorkspaceSlugFormat,
  omitWorkspaceSlug,
  WORKSPACE_SLUG_ZOD
} from "./workspaceSlug.js";

describe("isValidWorkspaceSlugFormat", () => {
  it("accepts typical slugs", () => {
    expect(isValidWorkspaceSlugFormat("acme")).toBe(true);
    expect(isValidWorkspaceSlugFormat("acme-corp")).toBe(true);
    expect(isValidWorkspaceSlugFormat("ab")).toBe(true);
  });

  it("rejects empty, too short, too long, bad chars", () => {
    expect(isValidWorkspaceSlugFormat("")).toBe(false);
    expect(isValidWorkspaceSlugFormat("a")).toBe(false);
    expect(isValidWorkspaceSlugFormat("A")).toBe(false);
    expect(isValidWorkspaceSlugFormat("Acme")).toBe(false);
    expect(isValidWorkspaceSlugFormat("acme_corp")).toBe(false);
    expect(isValidWorkspaceSlugFormat("acme.com")).toBe(false);
    expect(isValidWorkspaceSlugFormat("../x")).toBe(false);
    expect(isValidWorkspaceSlugFormat("a".repeat(51))).toBe(false);
  });
});

describe("WORKSPACE_SLUG_ZOD", () => {
  it("parses boundary length", () => {
    expect(WORKSPACE_SLUG_ZOD.safeParse("ab").success).toBe(true);
    expect(WORKSPACE_SLUG_ZOD.safeParse("a".repeat(50)).success).toBe(true);
  });
});

describe("assertToolArgsMatchPinnedWorkspace", () => {
  it("accepts exact match", () => {
    expect(() =>
      assertToolArgsMatchPinnedWorkspace({ workspaceSlug: "demo" }, "demo", "drd_meta")
    ).not.toThrow();
  });

  it("accepts case-insensitive match vs pin", () => {
    expect(() =>
      assertToolArgsMatchPinnedWorkspace({ workspaceSlug: "Demo" }, "demo", "drd_meta")
    ).not.toThrow();
  });

  it("rejects missing slug", () => {
    expect(() => assertToolArgsMatchPinnedWorkspace({}, "demo", "t")).toThrow(/workspaceSlug is required/);
  });

  it("rejects wrong slug", () => {
    expect(() =>
      assertToolArgsMatchPinnedWorkspace({ workspaceSlug: "other" }, "demo", "t")
    ).toThrow(/does not match this MCP server pin/);
  });

  it("rejects invalid slug format even if pin matches string-wise", () => {
    expect(() =>
      assertToolArgsMatchPinnedWorkspace({ workspaceSlug: "Bad_Slug" }, "Bad_Slug", "t")
    ).toThrow(/invalid workspaceSlug format/);
  });

  it("rejects non-object args", () => {
    expect(() => assertToolArgsMatchPinnedWorkspace(null, "demo", "t")).toThrow(/invalid arguments/);
  });
});

describe("omitWorkspaceSlug", () => {
  it("removes workspaceSlug key", () => {
    expect(omitWorkspaceSlug({ workspaceSlug: "x", a: 1 })).toEqual({ a: 1 });
  });
});

describe("readPinnedWorkspaceSlugForStdio", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("exits when slug missing and pinning not skipped", async () => {
    vi.resetModules();
    delete process.env.TYMIO_WORKSPACE_SLUG;
    delete process.env.DRD_WORKSPACE_SLUG;
    delete process.env.TYMIO_MCP_SKIP_WORKSPACE_PINNING;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await expect(async () => {
      const { readPinnedWorkspaceSlugForStdio } = await import("./workspaceSlug.js");
      readPinnedWorkspaceSlugForStdio();
    }).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes("Missing TYMIO_WORKSPACE_SLUG"))).toBe(true);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("returns null when SKIP pin is set", async () => {
    vi.resetModules();
    process.env.TYMIO_MCP_SKIP_WORKSPACE_PINNING = "1";
    delete process.env.TYMIO_WORKSPACE_SLUG;
    const { readPinnedWorkspaceSlugForStdio } = await import("./workspaceSlug.js");
    expect(readPinnedWorkspaceSlugForStdio()).toBeNull();
  });

  it("returns slug from TYMIO_WORKSPACE_SLUG", async () => {
    vi.resetModules();
    delete process.env.TYMIO_MCP_SKIP_WORKSPACE_PINNING;
    process.env.TYMIO_WORKSPACE_SLUG = "my-workspace";
    const { readPinnedWorkspaceSlugForStdio } = await import("./workspaceSlug.js");
    expect(readPinnedWorkspaceSlugForStdio()).toBe("my-workspace");
  });
});
