import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { REGISTERED_MCP_TOOL_NAMES } from "./registeredMcpToolNames.js";

function toolNamesFromRegisterToolFiles(files: URL[]): string[] {
  const re = /server\.registerTool\(\s*"([a-z0-9_]+)"/g;
  const names: string[] = [];
  for (const fileUrl of files) {
    const src = fs.readFileSync(fileUrl, "utf8");
    for (const m of src.matchAll(re)) names.push(m[1]);
  }
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

describe("REGISTERED_MCP_TOOL_NAMES", () => {
  it("matches every registerTool name in MCP tool modules (no drift)", () => {
    const fromSource = toolNamesFromRegisterToolFiles([
      new URL("./tools.ts", import.meta.url),
      new URL("./workspaceAtlasTools.ts", import.meta.url)
    ]);
    const fromRegistry = [...REGISTERED_MCP_TOOL_NAMES].sort((a, b) => a.localeCompare(b));
    expect(fromRegistry).toEqual(fromSource);
  });
});
