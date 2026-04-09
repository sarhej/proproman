import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRefresh } = vi.hoisted(() => ({
  mockRefresh: vi.fn()
}));

vi.mock("./mcpFeedbackNotice.js", () => ({
  refreshMcpFeedbackNoticeCache: () => mockRefresh()
}));

import { buildMcpAgentContextJson } from "./mcpAgentContextPayload.js";

describe("buildMcpAgentContextJson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns feedbackReporting and scopeReference with expected shape", async () => {
    mockRefresh.mockResolvedValueOnce("Report feedback via X.");

    const body = await buildMcpAgentContextJson();

    expect(body.feedbackReporting).toBe("Report feedback via X.");
    expect(body.scopeReference.pattern).toBe("<workspace-slug>/<product-slug>");
    expect(body.scopeReference.purpose).toContain("Not an access-control boundary");
    expect(body.scopeReference.workspaceUrls).toContain("/t/");
    expect(body.scopeReference.dataSources).toContain("drd_list_products");
    expect(body.supportedUiLocales.codes).toEqual(["en", "cs", "sk", "uk", "pl"]);
    expect(body.supportedUiLocales.locales.map((l) => l.code).join(",")).toBe("en,cs,sk,uk,pl");
    expect(body.supportedUiLocales.locales.find((l) => l.code === "pl")?.name).toBe("Polish");
    expect(body.supportedUiLocales.workspaceNote).toContain("enabledLocales");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(body.tymioMcpNoUserSettingsApiKey).toBe(true);
    expect(body.tymioMcpCliPackage).toBe("@tymio/mcp-server");
    expect(body.tymioMcpCliBinary).toBe("tymio-mcp");
    expect(body.tymioMcpCliInstructionsCommand).toBe("tymio-mcp instructions");
    expect(body.tymioMcpCliAgentGuidanceMarkdown.length).toBeGreaterThan(200);
    expect(body.tymioMcpCliAgentGuidanceMarkdown).toMatch(/Settings|OAuth|tymio-mcp/);
  });

  it("propagates refresh errors", async () => {
    mockRefresh.mockRejectedValueOnce(new Error("cache down"));
    await expect(buildMcpAgentContextJson()).rejects.toThrow("cache down");
  });
});
