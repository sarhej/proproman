import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { workspaceEntryUrl, copyWorkspaceEntryLink } from "./workspaceUrl";

function mockOrigin(origin: string) {
  const prev = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...prev, origin },
    writable: true,
  });
  return () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: prev,
      writable: true,
    });
  };
}

describe("workspaceEntryUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds sign-in path from origin and slug", () => {
    const restore = mockOrigin("https://tymio.app");
    expect(workspaceEntryUrl("acme-corp")).toBe("https://tymio.app/t/acme-corp");
    restore();
  });

  it("normalizes trailing slash on origin", () => {
    const restore = mockOrigin("https://tymio.app/");
    expect(workspaceEntryUrl("x")).toBe("https://tymio.app/t/x");
    restore();
  });
});

describe("copyWorkspaceEntryLink", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockClipboard(writeText: ReturnType<typeof vi.fn>) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
      writable: true,
    });
    return writeText;
  }

  it("writes workspace URL via clipboard API", async () => {
    const restore = mockOrigin("https://app.example.com");
    const writeText = mockClipboard(vi.fn().mockResolvedValue(undefined));
    const ok = await copyWorkspaceEntryLink("team-1");
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://app.example.com/t/team-1");
    restore();
  });

  it("uses execCommand fallback when clipboard rejects", async () => {
    const restore = mockOrigin("https://app.example.com");
    mockClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    const exec = vi.fn().mockReturnValue(true);
    const prevExec = document.execCommand;
    document.execCommand = exec as typeof document.execCommand;
    const ok = await copyWorkspaceEntryLink("fallback-slug");
    expect(ok).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    document.execCommand = prevExec;
    restore();
  });
});
