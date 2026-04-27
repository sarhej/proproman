import { describe, it, expect } from "vitest";
import {
  mergeCursorStyleMcpServers,
  mergeOpenCodeMcp,
  mergeCodexConfigToml,
  buildTymioMcpPatch
} from "./mergeMcpConfig.js";

describe("mergeCursorStyleMcpServers", () => {
  it("adds tymio-discovery and workspace keys", () => {
    const { next, conflict } = mergeCursorStyleMcpServers(
      {},
      buildTymioMcpPatch("cursor", "https://h/mcp", "https://h/t/x/mcp", "x") as Record<
        string,
        { url: string }
      >,
      false
    );
    expect(conflict).toBeNull();
    expect((next.mcpServers as Record<string, { url: string }>)["tymio-discovery"].url).toBe("https://h/mcp");
    expect((next.mcpServers as Record<string, { url: string }>)["tymio-x"].url).toBe("https://h/t/x/mcp");
  });

  it("conflicts when url differs and not force", () => {
    const { conflict } = mergeCursorStyleMcpServers(
      { mcpServers: { "tymio-discovery": { url: "https://old/mcp" } } },
      buildTymioMcpPatch("cursor", "https://new/mcp", null, null) as Record<string, { url: string }>,
      false
    );
    expect(conflict).toMatch(/differ/);
  });

  it("overwrites when force", () => {
    const { next, conflict } = mergeCursorStyleMcpServers(
      { mcpServers: { "tymio-discovery": { url: "https://old/mcp" } } },
      buildTymioMcpPatch("cursor", "https://new/mcp", null, null) as Record<string, { url: string }>,
      true
    );
    expect(conflict).toBeNull();
    expect((next.mcpServers as Record<string, { url: string }>)["tymio-discovery"].url).toBe("https://new/mcp");
  });
});

describe("mergeCodexConfigToml", () => {
  it("appends block when missing", () => {
    const out = mergeCodexConfigToml("", "https://x/t/s/mcp");
    expect(out).toMatch(/\[mcp_servers\.tymio\]/);
    expect(out).toMatch(/TYMIO_MCP_URL/);
  });

  it("replaces existing block", () => {
    const prev = `[other]\nx=1\n\n[mcp_servers.tymio]\ncommand = "old"\n\n[tail]\ny=2\n`;
    const out = mergeCodexConfigToml(prev, "https://hub/mcp");
    expect(out).toMatch(/@tymio\/mcp-server/);
    expect(out).toContain("[tail]");
  });
});

describe("mergeOpenCodeMcp", () => {
  it("merges remote entries", () => {
    const patch = buildTymioMcpPatch("opencode", "https://h/mcp", "https://h/t/a/mcp", "a") as Record<
      string,
      { type: "remote"; url: string; enabled: boolean }
    >;
    const { next, conflict } = mergeOpenCodeMcp({}, patch, false);
    expect(conflict).toBeNull();
    expect((next.mcp as Record<string, unknown>)["tymio-discovery"]).toBeDefined();
  });
});
