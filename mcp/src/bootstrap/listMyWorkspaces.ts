import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { defaultOAuthRedirectUrl } from "../configPaths.js";
import { FileOAuthProvider } from "../fileOAuthProvider.js";

export type ListedWorkspace = {
  slug: string;
  name: string;
  streamableHttpMcpUrl: string;
};

function pkgVersion(): string {
  try {
    const raw = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return "1.0.0";
  }
}

/** Parse JSON body from `tymio_list_my_workspaces` tool output. */
export function parseListMyWorkspacesPayload(text: string): ListedWorkspace[] {
  const parsed = JSON.parse(text) as { workspaces?: ListedWorkspace[] };
  if (!parsed.workspaces || !Array.isArray(parsed.workspaces)) {
    throw new Error("tymio_list_my_workspaces: invalid response shape (expected { workspaces: [] })");
  }
  return parsed.workspaces;
}

/** Extract primary text block from MCP `callTool` result. */
export function extractTextFromCallToolResult(result: unknown): string {
  const r = result as {
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
  };
  if (r?.isError) {
    const text = r.content?.map((c) => c.text).filter(Boolean).join("\n") || "MCP tool error";
    throw new Error(text);
  }
  const block = r?.content?.find((c) => c.type === "text" && typeof c.text === "string");
  if (!block?.text) {
    throw new Error("tymio_list_my_workspaces: empty tool result");
  }
  return block.text;
}

/**
 * Call discovery MCP `tymio_list_my_workspaces` using saved OAuth tokens on disk.
 * @throws UnauthorizedError when not signed in or token rejected
 */
export async function fetchMyWorkspacesViaMcp(discoveryMcpUrl: string): Promise<ListedWorkspace[]> {
  const url = new URL(discoveryMcpUrl);
  const redirectUrl = defaultOAuthRedirectUrl();
  const provider = new FileOAuthProvider(redirectUrl);
  const transport = new StreamableHTTPClientTransport(url, { authProvider: provider });
  const client = new Client(
    { name: "@tymio/mcp-server/bootstrap", version: pkgVersion() },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "tymio_list_my_workspaces",
      arguments: {}
    });
    const text = extractTextFromCallToolResult(result);
    return parseListMyWorkspacesPayload(text);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      throw e;
    }
    throw e;
  } finally {
    await client.close().catch(() => undefined);
  }
}
