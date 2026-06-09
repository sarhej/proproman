import { describe, expect, it } from "vitest";
import {
  extractTextFromCallToolResult,
  parseListMyWorkspacesPayload
} from "./listMyWorkspaces.js";

describe("parseListMyWorkspacesPayload", () => {
  it("parses workspaces array", () => {
    const rows = parseListMyWorkspacesPayload(
      JSON.stringify({
        workspaces: [
          {
            slug: "acme",
            name: "Acme Corp",
            streamableHttpMcpUrl: "https://tymio.app/t/acme/mcp"
          }
        ]
      })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe("acme");
  });

  it("throws on missing workspaces key", () => {
    expect(() => parseListMyWorkspacesPayload("{}")).toThrow(/invalid response shape/);
  });

  it("throws on non-array workspaces", () => {
    expect(() => parseListMyWorkspacesPayload(JSON.stringify({ workspaces: "nope" }))).toThrow(
      /invalid response shape/
    );
  });
});

describe("extractTextFromCallToolResult", () => {
  it("returns first text block", () => {
    const text = extractTextFromCallToolResult({
      content: [{ type: "text", text: '{"workspaces":[]}' }]
    });
    expect(text).toBe('{"workspaces":[]}');
  });

  it("throws on isError", () => {
    expect(() =>
      extractTextFromCallToolResult({
        isError: true,
        content: [{ type: "text", text: "denied" }]
      })
    ).toThrow("denied");
  });

  it("throws on empty content", () => {
    expect(() => extractTextFromCallToolResult({ content: [] })).toThrow(/empty tool result/);
  });
});
