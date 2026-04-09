import { describe, expect, it, vi } from "vitest";
import { writeStdioStartupHint } from "./stdioHints.js";

describe("writeStdioStartupHint", () => {
  it("skips when TYMIO_MCP_QUIET is set", () => {
    process.env.TYMIO_MCP_QUIET = "1";
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    writeStdioStartupHint("oauth");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    delete process.env.TYMIO_MCP_QUIET;
  });

  it("writes oauth hint when stderr is a TTY", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const desc = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    try {
      writeStdioStartupHint("oauth");
      expect(spy).toHaveBeenCalledWith(
        expect.stringMatching(/tymio-mcp instructions|TYMIO_WORKSPACE_SLUG|Settings/)
      );
    } finally {
      if (desc) Object.defineProperty(process.stderr, "isTTY", desc);
      else delete (process.stderr as { isTTY?: boolean }).isTTY;
      spy.mockRestore();
    }
  });

  it("writes api-key hint when stderr is a TTY", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const desc = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    try {
      writeStdioStartupHint("api-key");
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/API-key REST bridge/));
    } finally {
      if (desc) Object.defineProperty(process.stderr, "isTTY", desc);
      else delete (process.stderr as { isTTY?: boolean }).isTTY;
      spy.mockRestore();
    }
  });

  it("adds persona line when TYMIO_MCP_PERSONA is set", () => {
    process.env.TYMIO_MCP_PERSONA = "dev";
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const desc = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    try {
      writeStdioStartupHint("oauth");
      const joined = spy.mock.calls.map((c) => String(c[0])).join("");
      expect(joined).toMatch(/TYMIO_MCP_PERSONA=dev/);
      expect(joined).toMatch(/tymio-mcp persona dev/);
    } finally {
      delete process.env.TYMIO_MCP_PERSONA;
      if (desc) Object.defineProperty(process.stderr, "isTTY", desc);
      else delete (process.stderr as { isTTY?: boolean }).isTTY;
      spy.mockRestore();
    }
  });
});
