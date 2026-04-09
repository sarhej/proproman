import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const connectMock = vi.hoisted(() => vi.fn());
const listToolsMock = vi.hoisted(() => vi.fn());
const callToolMock = vi.hoisted(() => vi.fn());

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn(function MockClient(this: {
    connect: typeof connectMock;
    listTools: typeof listToolsMock;
    callTool: typeof callToolMock;
  }) {
    this.connect = connectMock;
    this.listTools = listToolsMock;
    this.callTool = callToolMock;
  })
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class {
    constructor(
      public url: URL,
      public opts: unknown
    ) {}
  }
}));

vi.mock("./fileOAuthProvider.js", () => ({
  FileOAuthProvider: class {
    constructor(public u: URL) {}
  }
}));

import { runHubOAuthStdio } from "./hubProxyStdio.js";
import { withTempXdgConfig } from "./test/helpers.js";

describe("runHubOAuthStdio", () => {
  let ctx: ReturnType<typeof withTempXdgConfig>;
  let serverConnectSpy: ReturnType<typeof vi.spyOn>;
  let registerToolSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.TYMIO_MCP_QUIET = "1";
    ctx = withTempXdgConfig();
    connectMock.mockReset();
    listToolsMock.mockReset();
    callToolMock.mockReset();
    connectMock.mockResolvedValue(undefined);
    listToolsMock.mockResolvedValue({
      tools: [
        { name: "drd_health", description: "Health check", title: "Health" },
        { name: "drd_meta", description: "Meta" }
      ]
    });
    callToolMock.mockResolvedValue({
      content: [{ type: "text", text: "ok" }]
    });
    serverConnectSpy = vi.spyOn(McpServer.prototype, "connect").mockResolvedValue(undefined as never);
    registerToolSpy = vi.spyOn(McpServer.prototype, "registerTool");
    exitSpy = vi.spyOn(process, "exit").mockImplementation(function exitForTest(code?: number): never {
      throw new Error(`exit:${code ?? ""}`);
    });
  });

  afterEach(() => {
    delete process.env.TYMIO_MCP_QUIET;
    ctx.cleanup();
    serverConnectSpy.mockRestore();
    registerToolSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("exits with message on UnauthorizedError", async () => {
    connectMock.mockRejectedValueOnce(new UnauthorizedError("no token"));
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await expect(runHubOAuthStdio(new URL("https://hub/mcp"))).rejects.toThrow("exit:1");
    const stderr = err.mock.calls.map((c) => String(c[0])).join("\n");
    expect(stderr).toMatch(/tymio-mcp login/);
    expect(stderr).toMatch(/tymio-mcp instructions/);
    expect(stderr).toMatch(/Settings|user Settings/);
    expect(exitSpy).toHaveBeenCalledWith(1);
    err.mockRestore();
  });

  it("rethrows non-auth errors from connect", async () => {
    connectMock.mockRejectedValueOnce(new Error("boom"));
    await expect(runHubOAuthStdio(new URL("https://hub/mcp"))).rejects.toThrow("boom");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("lists tools, registers proxies, and attaches stdio", async () => {
    await runHubOAuthStdio(new URL("https://hub/mcp"));

    expect(connectMock).toHaveBeenCalledOnce();
    expect(listToolsMock).toHaveBeenCalledOnce();
    expect(serverConnectSpy).toHaveBeenCalledOnce();
  });

  it("registers zero tools when server returns empty list", async () => {
    listToolsMock.mockResolvedValueOnce({ tools: [] });
    await runHubOAuthStdio(new URL("https://hub/mcp"));
    expect(serverConnectSpy).toHaveBeenCalledOnce();
  });

  it("proxy tool handler forwards to upstream callTool", async () => {
    await runHubOAuthStdio(new URL("https://hub/mcp"));
    const healthRegistration = registerToolSpy.mock.calls.find((c) => c[0] === "drd_health");
    expect(healthRegistration).toBeDefined();
    const handler = healthRegistration![2] as (args: Record<string, unknown>) => Promise<unknown>;
    await handler({ k: "v" });
    expect(callToolMock).toHaveBeenCalledWith({
      name: "drd_health",
      arguments: { k: "v" }
    });
  });
});
