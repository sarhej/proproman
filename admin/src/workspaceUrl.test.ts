import { describe, it, expect, vi, afterEach } from "vitest";
import { workspaceSignInUrl, copyText } from "./workspaceUrl";

describe("workspaceSignInUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds /t/{slug} from window origin", () => {
    const prev = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...prev, origin: "https://tymio.app" },
      writable: true,
    });
    expect(workspaceSignInUrl("my-team")).toBe("https://tymio.app/t/my-team");
    Object.defineProperty(window, "location", { configurable: true, value: prev, writable: true });
  });
});

describe("copyText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
      writable: true,
    });
    const ok = await copyText("hello");
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back when clipboard throws", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
      writable: true,
    });
    const exec = vi.fn().mockReturnValue(true);
    const prevExec = document.execCommand;
    document.execCommand = exec as typeof document.execCommand;
    const ok = await copyText("fallback");
    expect(ok).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    document.execCommand = prevExec;
  });
});
