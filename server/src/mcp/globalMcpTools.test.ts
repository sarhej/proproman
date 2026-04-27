import { describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGlobalMcpTools } from "./globalMcpTools.js";

describe("registerGlobalMcpTools", () => {
  it("registers only workspace-agnostic discovery tools", () => {
    const names: string[] = [];
    const server = {
      registerTool(name: string, _meta: unknown, _handler: unknown) {
        names.push(name);
      }
    } as unknown as McpServer;
    registerGlobalMcpTools(server);
    expect(names.sort()).toEqual(
      [
        "tymio_install_skill",
        "tymio_list_my_workspaces",
        "tymio_list_skills",
        "tymio_mcp_routing_guide"
      ].sort()
    );
  });
});
