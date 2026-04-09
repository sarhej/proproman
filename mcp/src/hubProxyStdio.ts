import { readFileSync } from "node:fs";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { defaultMcpUrl, defaultOAuthRedirectUrl } from "./configPaths.js";
import { FileOAuthProvider } from "./fileOAuthProvider.js";
import { AGENT_INSTRUCTIONS } from "./cliMessages.js";
import { writeStdioStartupHint } from "./stdioHints.js";

function pkgVersion(): string {
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return "1.0.0";
  }
}

const passthroughArgs = z.object({}).passthrough();

/**
 * Stdio MCP server that proxies to the hosted Tymio Streamable HTTP MCP endpoint with OAuth tokens on disk.
 */
export async function runHubOAuthStdio(mcpUrl: URL = defaultMcpUrl()): Promise<void> {
  writeStdioStartupHint("oauth");
  const redirectUrl = defaultOAuthRedirectUrl();
  const provider = new FileOAuthProvider(redirectUrl);
  const transport = new StreamableHTTPClientTransport(mcpUrl, { authProvider: provider });
  const client = new Client(
    { name: "@tymio/mcp-server", version: pkgVersion() },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      process.stderr.write(
        "Tymio MCP: not signed in or session expired.\n  Run: tymio-mcp login  (there is no MCP API key in Tymio user Settings)\n  Or:  tymio-mcp instructions  (full setup for agents)\n  API-key mode: set DRD_API_KEY (server deployment secret), not a UI setting.\n"
      );
      process.exit(1);
    }
    throw e;
  }

  const { tools } = await client.listTools();
  const server = new McpServer(
    { name: "tymio-hub", version: pkgVersion() },
    { instructions: AGENT_INSTRUCTIONS }
  );

  for (const tool of tools) {
    const name = tool.name;
    server.registerTool(
      name,
      {
        title: tool.title,
        description: tool.description ?? "",
        inputSchema: passthroughArgs
      },
      async (args) => {
        const result = await client.callTool({
          name,
          arguments: (args as Record<string, unknown>) ?? {}
        });
        return result as CallToolResult;
      }
    );
  }

  const stdio = new StdioServerTransport();
  await server.connect(stdio);
}
