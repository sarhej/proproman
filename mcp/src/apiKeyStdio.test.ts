import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runApiKeyStdio } from "./apiKeyStdio.js";
import { withTempXdgConfig } from "./test/helpers.js";

describe("runApiKeyStdio", () => {
  let connectSpy: ReturnType<typeof vi.spyOn>;
  let ctx: ReturnType<typeof withTempXdgConfig>;

  beforeEach(() => {
    process.env.TYMIO_MCP_QUIET = "1";
    process.env.TYMIO_MCP_SKIP_WORKSPACE_PINNING = "1";
    ctx = withTempXdgConfig();
    connectSpy = vi.spyOn(McpServer.prototype, "connect").mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    delete process.env.TYMIO_MCP_QUIET;
    delete process.env.TYMIO_MCP_SKIP_WORKSPACE_PINNING;
    connectSpy.mockRestore();
    ctx.cleanup();
  });

  it("connects stdio transport without invoking real stdin loop", async () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await runApiKeyStdio();
    expect(connectSpy).toHaveBeenCalledOnce();
    err.mockRestore();
  });
});
