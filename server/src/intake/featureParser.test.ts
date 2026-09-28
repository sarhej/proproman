import { describe, it, expect } from "vitest";
import { buildHeuristicFeatureDrafts } from "./featureParser.js";
import type { CreationPlan } from "./creationPlanSchema.js";

const featurePlan: CreationPlan = {
  planType: "SINGLE_FEATURE",
  rationale: "test",
  confidence: 0.7,
  items: [
    {
      key: "feat-1",
      hubEntityType: "Feature",
      title: "Better product filters",
      storyType: "FUNCTIONAL",
      parentKey: null,
      suggestedPriority: "P2"
    },
    {
      key: "req-1",
      hubEntityType: "Requirement",
      title: "Filter by label",
      parentKey: "feat-1"
    }
  ]
};

describe("buildHeuristicFeatureDrafts", () => {
  it("fills structured fields and default AC", () => {
    const text = `Better product filters
Problem: Users cannot find initiatives by label
Solution: Add filter chips for labels and owner
Personas:
- Product owner
- PM
Business value: Faster triage
Acceptance criteria:
- User can filter by label
- Filter state persists in URL
Risks:
- Perf on large trees`;

    const drafts = buildHeuristicFeatureDrafts({
      rawText: text,
      creationPlan: featurePlan
    });

    expect(drafts.items).toHaveLength(1);
    const d = drafts.items[0]!;
    expect(d.key).toBe("feat-1");
    expect(d.storyType).toBe("FUNCTIONAL");
    expect(d.priority).toBe("P2");
    expect(d.problem.toLowerCase()).toContain("label");
    expect(d.solution.toLowerCase()).toContain("filter");
    expect(d.personas.length).toBeGreaterThanOrEqual(1);
    expect(d.acceptanceCriteria.length).toBeGreaterThanOrEqual(1);
    expect(d.requirements).toHaveLength(1);
    expect(d.risks.some((r) => /perf/i.test(r))).toBe(true);
  });

  it("uses Discovery from clarification kind", () => {
    const drafts = buildHeuristicFeatureDrafts({
      rawText: "Something about reporting maybe",
      creationPlan: {
        ...featurePlan,
        items: [{ ...featurePlan.items[0]!, suggestedPriority: null }]
      },
      clarificationAnswers: { kind: "Discovery", persona: "Analyst" }
    });
    expect(drafts.items[0]!.priority).toBe("DISCOVERY");
    expect(drafts.items[0]!.storyType).toBe("RESEARCH");
    expect(drafts.items[0]!.personas).toContain("Analyst");
    expect(drafts.items[0]!.acceptanceCriteria.length).toBeGreaterThan(0);
  });

  it("creates placeholder when plan has only BUG features", () => {
    const drafts = buildHeuristicFeatureDrafts({
      rawText: "Improve onboarding checklist for new tenants",
      creationPlan: {
        planType: "SINGLE_BUG_FEATURE",
        rationale: "x",
        confidence: 0.5,
        items: [
          {
            key: "bug-1",
            hubEntityType: "Feature",
            title: "Login clipped",
            storyType: "BUG"
          }
        ]
      }
    });
    expect(drafts.items).toHaveLength(1);
    expect(drafts.items[0]!.storyType).not.toBe("BUG");
    expect(drafts.items[0]!.title).toMatch(/Improve onboarding/i);
  });
});
