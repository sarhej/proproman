import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runHubOAuthStdio = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const runApiKeyStdio = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const runLoginCommand = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const removeAllOAuthFiles = vi.hoisted(() => vi.fn());

vi.mock("./hubProxyStdio.js", () => ({ runHubOAuthStdio }));
vi.mock("./apiKeyStdio.js", () => ({ runApiKeyStdio }));
vi.mock("./loginCommand.js", () => ({ runLoginCommand }));
vi.mock("./fileOAuthProvider.js", () => ({
  removeAllOAuthFiles,
  FileOAuthProvider: class {}
}));

import { runCli } from "./cli.js";

const envSnapshot = {
  DRD_API_KEY: process.env.DRD_API_KEY,
  API_KEY: process.env.API_KEY
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DRD_API_KEY;
  delete process.env.API_KEY;
  process.env.TYMIO_MCP_SKIP_WORKSPACE_PINNING = "1";
});

afterEach(() => {
  for (const [k, v] of Object.entries(envSnapshot)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  delete process.env.TYMIO_MCP_SKIP_WORKSPACE_PINNING;
});

describe("runCli", () => {
  it("prints instructions for instructions and guide", async () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await runCli(["node", "tymio-mcp", "instructions"]);
    const out = spy.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toMatch(/Cursor/i);
    expect(out).toMatch(/tymio-mcp login/);
    expect(out).toMatch(/Settings|per-user MCP API key|Critical/i);
    spy.mockClear();
    await runCli(["node", "tymio-mcp", "guide"]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("prints help for help, -h, --help", async () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await runCli(["node", "tymio-mcp", "help"]);
    const help = spy.mock.calls.map((c) => String(c[0])).join("");
    expect(help).toMatch(/tymio-mcp login/);
    expect(help).toMatch(/instructions/);
    spy.mockClear();
    await runCli(["node", "tymio-mcp", "-h"]);
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    await runCli(["node", "tymio-mcp", "--help"]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("filters bare -- from args", async () => {
    await runCli(["node", "tymio-mcp", "--", "help"]);
    expect(runHubOAuthStdio).not.toHaveBeenCalled();
  });

  it("logout removes OAuth files and logs", async () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await runCli(["node", "tymio-mcp", "logout"]);
    expect(removeAllOAuthFiles).toHaveBeenCalledOnce();
    expect(spy.mock.calls.some((c) => String(c[0]).includes("Removed"))).toBe(true);
    spy.mockRestore();
  });

  it("login uses default URL when omitted", async () => {
    await runCli(["node", "tymio-mcp", "login"]);
    expect(runLoginCommand).toHaveBeenCalledOnce();
    const arg = runLoginCommand.mock.calls[0][0] as URL;
    expect(arg.href).toMatch(/tymio\.app\/mcp/);
  });

  it("login passes explicit MCP URL", async () => {
    await runCli(["node", "tymio-mcp", "login", "https://custom.example/mcp"]);
    expect(runLoginCommand).toHaveBeenCalledWith(new URL("https://custom.example/mcp"));
  });

  it("uses API key bridge when DRD_API_KEY is non-empty", async () => {
    process.env.DRD_API_KEY = "secret";
    await runCli(["node", "tymio-mcp"]);
    expect(runApiKeyStdio).toHaveBeenCalledOnce();
    expect(runHubOAuthStdio).not.toHaveBeenCalled();
  });

  it("uses API key bridge when API_KEY is set", async () => {
    process.env.API_KEY = "k";
    await runCli(["node", "tymio-mcp"]);
    expect(runApiKeyStdio).toHaveBeenCalledOnce();
  });

  it("ignores whitespace-only DRD_API_KEY", async () => {
    process.env.DRD_API_KEY = "  \t  ";
    await runCli(["node", "tymio-mcp"]);
    expect(runHubOAuthStdio).toHaveBeenCalledOnce();
    expect(runApiKeyStdio).not.toHaveBeenCalled();
  });

  it("defaults to hub OAuth stdio when no subcommand and no API key", async () => {
    await runCli(["node", "tymio-mcp"]);
    expect(runHubOAuthStdio).toHaveBeenCalledOnce();
  });

  it("persona pm prints to stdout and sets exit code 0", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runCli(["node", "tymio-mcp", "persona", "pm"]);
    const out = spy.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toMatch(/Product Manager/);
    expect(process.exitCode).toBe(0);
    process.exitCode = 0;
    spy.mockRestore();
  });

  it("persona unknown sets exit code 1", async () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await runCli(["node", "tymio-mcp", "persona", "nope"]);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    spy.mockRestore();
  });

  it("unknown first arg still starts hub OAuth stdio", async () => {
    await runCli(["node", "tymio-mcp", "unexpected"]);
    expect(runHubOAuthStdio).toHaveBeenCalledOnce();
  });

  it("login with invalid URL throws from URL parser", async () => {
    await expect(runCli(["node", "tymio-mcp", "login", "not-a-url"])).rejects.toThrow();
  });
});
