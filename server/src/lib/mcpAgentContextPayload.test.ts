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
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("propagates refresh errors", async () => {
    mockRefresh.mockRejectedValueOnce(new Error("cache down"));
    await expect(buildMcpAgentContextJson()).rejects.toThrow("cache down");
  });
});
