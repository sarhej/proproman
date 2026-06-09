import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.hoisted(() => vi.fn());
const callToolMock = vi.hoisted(() => vi.fn());
const closeMock = vi.hoisted(() => vi.fn());

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn(function MockClient(this: {
    connect: typeof connectMock;
    callTool: typeof callToolMock;
    close: typeof closeMock;
  }) {
    this.connect = connectMock;
    this.callTool = callToolMock;
    this.close = closeMock;
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

vi.mock("../fileOAuthProvider.js", () => ({
  FileOAuthProvider: class {
    constructor(public u: URL) {}
  }
}));

import { fetchMyWorkspacesViaMcp } from "./listMyWorkspaces.js";

describe("fetchMyWorkspacesViaMcp", () => {
  beforeEach(() => {
    connectMock.mockReset();
    callToolMock.mockReset();
    closeMock.mockReset();
    connectMock.mockResolvedValue(undefined);
    closeMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("connects to discovery URL and parses workspaces", async () => {
    callToolMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            workspaces: [{ slug: "acme", name: "Acme", streamableHttpMcpUrl: "https://h/t/acme/mcp" }]
          })
        }
      ]
    });

    const rows = await fetchMyWorkspacesViaMcp("https://tymio.app/mcp");
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe("acme");
    expect(connectMock).toHaveBeenCalledOnce();
    expect(callToolMock).toHaveBeenCalledWith({
      name: "tymio_list_my_workspaces",
      arguments: {}
    });
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it("propagates UnauthorizedError", async () => {
    connectMock.mockRejectedValueOnce(new UnauthorizedError("no token"));
    await expect(fetchMyWorkspacesViaMcp("https://tymio.app/mcp")).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it("closes client after tool errors", async () => {
    callToolMock.mockRejectedValueOnce(new Error("tool failed"));
    await expect(fetchMyWorkspacesViaMcp("https://tymio.app/mcp")).rejects.toThrow("tool failed");
    expect(closeMock).toHaveBeenCalledOnce();
  });
});
