import { describe, it, expect } from "vitest";
import {
  discoveryCommitMapping,
  featureDraftSchema,
  normalizeFeatureDraft,
  normalizeFeatureIntakeDrafts
} from "./featureDraftSchema.js";

describe("discoveryCommitMapping", () => {
  it("maps DISCOVERY to RESEARCH + P3 for Phase 5", () => {
    expect(discoveryCommitMapping("DISCOVERY")).toEqual({
      storyType: "RESEARCH",
      hubPriority: "P3"
    });
  });

  it("passes through P0-P3 as FUNCTIONAL", () => {
    expect(discoveryCommitMapping("P1")).toEqual({
      storyType: "FUNCTIONAL",
      hubPriority: "P1"
    });
  });
});

describe("normalizeFeatureDraft", () => {
  const base = {
    key: "feat-1",
    hubEntityType: "Feature" as const,
    storyType: "FUNCTIONAL" as const,
    title: "Better filters",
    priority: "DISCOVERY" as const,
    fieldProvenance: { priority: "ai" as const }
  };

  it("aligns Discovery drafts to RESEARCH storyType", () => {
    const n = normalizeFeatureDraft(featureDraftSchema.parse(base));
    expect(n.priority).toBe("DISCOVERY");
    expect(n.storyType).toBe("RESEARCH");
  });

  it("keeps FUNCTIONAL when priority is P2", () => {
    const n = normalizeFeatureDraft(
      featureDraftSchema.parse({ ...base, priority: "P2", storyType: "FUNCTIONAL" })
    );
    expect(n.storyType).toBe("FUNCTIONAL");
    expect(n.priority).toBe("P2");
  });

  it("normalizeFeatureIntakeDrafts validates list", () => {
    const out = normalizeFeatureIntakeDrafts({
      items: [featureDraftSchema.parse(base)],
      source: "heuristic"
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.acceptanceCriteria).toEqual([]);
  });
});
