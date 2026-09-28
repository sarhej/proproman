import { describe, it, expect } from "vitest";
import {
  buildBugFeatureDescription,
  buildFeatureDescription,
  evaluateCommitGate,
  requirementTitlesFromDraft
} from "./commitDrafts.js";
import { resolveFeatureCommitStoryAndPriority } from "./featureDraftSchema.js";
import type { BugDraft } from "./bugDraftSchema.js";
import type { FeatureDraft } from "./featureDraftSchema.js";

function bug(overrides?: Partial<BugDraft>): BugDraft {
  return {
    key: "bug-1",
    hubEntityType: "Feature",
    storyType: "BUG",
    approval: "pending",
    fieldProvenance: {},
    title: "Login clipped",
    description: "CTA issue",
    stepsToReproduce: ["Open", "Rotate"],
    expected: "Visible",
    actual: "Clipped",
    environment: "iOS",
    severity: "HIGH",
    priority: "P1",
    acceptanceCriteria: ["CTA visible after rotate"],
    affectedArea: "Login",
    route: { initiativeId: null, featureId: null },
    requirements: [{ key: "bug-1-r1", title: "Add screenshot fixture", description: "", approval: "pending" }],
    ...overrides
  };
}

function feat(overrides?: Partial<FeatureDraft>): FeatureDraft {
  return {
    key: "feat-1",
    hubEntityType: "Feature",
    storyType: "FUNCTIONAL",
    approval: "pending",
    fieldProvenance: {},
    title: "Filters",
    problem: "Hard to find",
    solution: "Add facets",
    personas: ["PM"],
    businessValue: "Speed",
    priority: "P2",
    priorityRationale: "Core workflow",
    missingInputs: ["Metric"],
    acceptanceCriteria: ["Filter by status", "Filter by status"],
    dependencies: ["Search index"],
    risks: ["Perf"],
    openQuestions: ["Default filters?"],
    route: { initiativeId: null, featureId: null },
    requirements: [{ key: "feat-1-r1", title: "Filter by status", description: "dup", approval: "pending" }],
    ...overrides
  };
}

describe("evaluateCommitGate", () => {
  it("U7: rejects when any pending", () => {
    const g = evaluateCommitGate([bug({ approval: "approved" }), bug({ key: "b2", approval: "pending" })]);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("PENDING");
  });

  it("U8: rejects when all skipped", () => {
    const g = evaluateCommitGate([bug({ approval: "skipped" })]);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("NONE_APPROVED");
  });

  it("U9: allows approved+skipped", () => {
    const g = evaluateCommitGate([
      bug({ approval: "approved" }),
      bug({ key: "b2", approval: "skipped" })
    ]);
    expect(g.ok).toBe(true);
    if (g.ok) {
      expect(g.approved).toHaveLength(1);
      expect(g.skippedKeys).toEqual(["b2"]);
    }
  });

  it("U10: allows all approved", () => {
    const g = evaluateCommitGate([bug({ approval: "approved" })]);
    expect(g.ok).toBe(true);
  });

  it("rejects empty", () => {
    const g = evaluateCommitGate([]);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("NO_DRAFTS");
  });
});

describe("commit mapping", () => {
  it("U1: bug description includes structured sections", () => {
    const d = buildBugFeatureDescription(bug());
    expect(d).toContain("CTA issue");
    expect(d).toContain("## Steps to reproduce");
    expect(d).toContain("1. Open");
    expect(d).toContain("## Expected");
    expect(d).toContain("## Actual");
    expect(d).toContain("## Environment");
    expect(d).toContain("## Affected area");
  });

  it("U2/U3/U4: story+priority mapping", () => {
    expect(resolveFeatureCommitStoryAndPriority(feat({ priority: "P1", storyType: "FUNCTIONAL" }))).toEqual({
      storyType: "FUNCTIONAL",
      hubPriority: "P1"
    });
    expect(resolveFeatureCommitStoryAndPriority(feat({ priority: "DISCOVERY", storyType: "FUNCTIONAL" }))).toEqual({
      storyType: "RESEARCH",
      hubPriority: "P3"
    });
    expect(resolveFeatureCommitStoryAndPriority(feat({ priority: "P2", storyType: "TECH_DEBT" }))).toEqual({
      storyType: "TECH_DEBT",
      hubPriority: "P2"
    });
  });

  it("U5: AC + nested requirements dedupe by title", () => {
    const titles = requirementTitlesFromDraft(feat());
    expect(titles.map((t) => t.title)).toEqual(["Filter by status"]);
  });

  it("U6: empty AC and nested → no requirements", () => {
    expect(
      requirementTitlesFromDraft(bug({ acceptanceCriteria: [], requirements: [] }))
    ).toEqual([]);
  });

  it("feature description includes problem/solution blocks", () => {
    const d = buildFeatureDescription(feat());
    expect(d).toContain("## Problem");
    expect(d).toContain("## Solution");
    expect(d).toContain("## Personas");
    expect(d).toContain("## Priority rationale");
  });
});
