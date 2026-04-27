import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("../lib/mcpFeedbackNotice.js", () => ({
  appendMcpFeedbackToToolResult: (t: string) => t
}));

import { registerSkillDistributionTools } from "./skillDistributionTools.js";

function createRegistry() {
  const tools = new Map<string, (args: unknown, ctx: unknown) => Promise<unknown>>();
  const server = {
    registerTool(name: string, _meta: unknown, handler: (args: unknown, ctx: unknown) => Promise<unknown>) {
      tools.set(name, handler);
    }
  } as unknown as McpServer;
  registerSkillDistributionTools(server);
  return tools;
}

const authedCtx = { authInfo: { extra: { userId: "u1", role: "EDITOR" } } };

describe("registerSkillDistributionTools", () => {
  it("registers tymio_list_skills and tymio_install_skill", () => {
    const tools = createRegistry();
    expect([...tools.keys()].sort()).toEqual(["tymio_install_skill", "tymio_list_skills"]);
  });

  it("tymio_list_skills returns JSON array without bodies", async () => {
    const tools = createRegistry();
    const raw = await tools.get("tymio_list_skills")!({}, authedCtx);
    const text = (raw as { content: { text: string }[] }).content[0].text;
    const parsed = JSON.parse(text) as { id: string }[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some((r) => r.id === "tymio-workspace")).toBe(true);
    expect(parsed[0].body).toBeUndefined();
  });

  it("tymio_list_skills rejects unauthenticated ctx", async () => {
    const tools = createRegistry();
    await expect(tools.get("tymio_list_skills")!({}, {})).rejects.toThrow(/Not authenticated/);
  });

  it("tymio_install_skill returns payload for valid args", async () => {
    const tools = createRegistry();
    const raw = await tools.get("tymio_install_skill")!(
      { id: "tymio-workspace", client: "cursor", scope: "project" },
      authedCtx
    );
    const text = (raw as { content: { text: string }[] }).content[0].text;
    const parsed = JSON.parse(text) as { targetPath: string; sha256: string };
    expect(parsed.targetPath).toBe(".cursor/skills/tymio-workspace/SKILL.md");
    expect(parsed.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("tymio_install_skill returns error JSON for unknown id", async () => {
    const tools = createRegistry();
    const raw = await tools.get("tymio_install_skill")!(
      { id: "missing-id-xyz", client: "cursor", scope: "project" },
      authedCtx
    );
    const text = (raw as { content: { text: string }[] }).content[0].text;
    const parsed = JSON.parse(text) as { error: string };
    expect(parsed.error).toMatch(/Unknown skill/);
  });

  it("tymio_install_skill rejects unauthenticated ctx", async () => {
    const tools = createRegistry();
    await expect(
      tools.get("tymio_install_skill")!({ id: "tymio-workspace", client: "cursor", scope: "project" }, {})
    ).rejects.toThrow(/Not authenticated/);
  });
});
