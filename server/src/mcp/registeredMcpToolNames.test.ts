import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { REGISTERED_MCP_TOOL_NAMES } from "./registeredMcpToolNames.js";

function toolNamesFromToolsSource(): string[] {
  const path = new URL("./tools.ts", import.meta.url);
  const src = fs.readFileSync(path, "utf8");
  const re = /server\.registerTool\(\s*"([a-z0-9_]+)"/g;
  const names: string[] = [];
  for (const m of src.matchAll(re)) names.push(m[1]);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

describe("REGISTERED_MCP_TOOL_NAMES", () => {
  it("matches every registerTool name in tools.ts (no drift)", () => {
    const fromSource = toolNamesFromToolsSource();
    const fromRegistry = [...REGISTERED_MCP_TOOL_NAMES].sort((a, b) => a.localeCompare(b));
    expect(fromRegistry).toEqual(fromSource);
  });
});
