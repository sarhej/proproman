import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  buildCuratorTopicContext: vi.fn(),
  loadCuratorTopicIds: vi.fn(),
  intakeCuratorProposals: vi.fn()
}));

vi.mock("./context.js", () => ({
  buildCuratorTopicContext: hoisted.buildCuratorTopicContext,
  loadCuratorTopicIds: hoisted.loadCuratorTopicIds
}));

vi.mock("./intake.js", () => ({
  intakeCuratorProposals: hoisted.intakeCuratorProposals
}));

import { runAtlasCurator } from "./run.js";
import type { AtlasCuratorLlm } from "./llm.js";

const mockLlm: AtlasCuratorLlm = {
  completeJson: vi.fn(async () =>
    JSON.stringify({
      proposals: [
        {
          proposalType: "GAP_REPORT",
          proposedValue: { kind: "test", message: "gap" },
          sources: [{ kind: "other", ref: "test" }]
        }
      ]
    })
  )
};

describe("runAtlasCurator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.loadCuratorTopicIds.mockResolvedValue(["topic-1"]);
    hoisted.buildCuratorTopicContext.mockResolvedValue({
      topic: {
        id: "topic-1",
        slug: "multi",
        title: "Multitenancy",
        asIsSummary: null,
        toBeSummary: null,
        synonyms: null,
        docPaths: null,
        lockedFields: null,
        autoMatchCapabilities: true
      },
      lockedFields: [],
      compiledShard: null,
      recentGitActivity: []
    });
    hoisted.intakeCuratorProposals.mockResolvedValue({
      created: 1,
      skipped: 0,
      proposalIds: ["p1"],
      results: [{ status: "created", proposalId: "p1" }]
    });
  });

  it("processes topics and returns aggregate counts", async () => {
    const result = await runAtlasCurator({
      tenantId: "tenant-1",
      llm: mockLlm
    });
    expect(result.topicsProcessed).toBe(1);
    expect(result.created).toBe(1);
    expect(result.proposalIds).toEqual(["p1"]);
    expect(mockLlm.completeJson).toHaveBeenCalledOnce();
  });

  it("records per-topic LLM errors without failing whole run", async () => {
    (mockLlm.completeJson as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("LLM down"));
    const result = await runAtlasCurator({ tenantId: "tenant-1", llm: mockLlm });
    expect(result.errors).toHaveLength(1);
    expect(result.topics[0].error).toBe("LLM down");
  });
});
