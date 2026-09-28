import { describe, it, expect } from "vitest";
import { buildHeuristicBugDrafts } from "./bugParser.js";
import type { CreationPlan } from "./creationPlanSchema.js";

const bugPlan: CreationPlan = {
  planType: "SINGLE_BUG_FEATURE",
  rationale: "test",
  confidence: 0.7,
  items: [
    {
      key: "bug-1",
      hubEntityType: "Feature",
      title: "Login CTA clipped on rotate",
      storyType: "BUG",
      parentKey: null,
      bugSeverity: "HIGH"
    },
    {
      key: "req-1",
      hubEntityType: "Requirement",
      title: "CTA fully visible after rotate",
      parentKey: "bug-1"
    }
  ]
};

describe("buildHeuristicBugDrafts", () => {
  it("fills structured fields and severity→priority", () => {
    const text = `Login CTA clipped on rotate
Steps:
1. Open login on iPhone SE
2. Rotate to landscape
Expected: CTA fully visible
Actual: Button clipped on the right
Environment: iOS 18 Safari
Severity: HIGH
CTA should remain fully visible after rotate.`;

    const drafts = buildHeuristicBugDrafts({
      rawText: text,
      creationPlan: bugPlan
    });

    expect(drafts.items).toHaveLength(1);
    const d = drafts.items[0]!;
    expect(d.key).toBe("bug-1");
    expect(d.storyType).toBe("BUG");
    expect(d.severity).toBe("HIGH");
    expect(d.priority).toBe("P1");
    expect(d.stepsToReproduce.length).toBeGreaterThanOrEqual(2);
    expect(d.expected.toLowerCase()).toContain("visible");
    expect(d.actual.toLowerCase()).toContain("clip");
    expect(d.environment).toMatch(/iOS/i);
    expect(d.requirements).toHaveLength(1);
    expect(d.requirements[0]!.key).toBe("req-1");
    expect(d.acceptanceCriteria.some((a) => /visible/i.test(a))).toBe(true);
  });

  it("uses clarification severity when present", () => {
    const drafts = buildHeuristicBugDrafts({
      rawText: "Something is wrong with the button",
      creationPlan: {
        ...bugPlan,
        items: [{ ...bugPlan.items[0]!, bugSeverity: null }]
      },
      clarificationAnswers: { severity: "CRITICAL" }
    });
    expect(drafts.items[0]!.severity).toBe("CRITICAL");
    expect(drafts.items[0]!.priority).toBe("P0");
  });

  it("creates a placeholder bug draft when plan has no BUG features", () => {
    const drafts = buildHeuristicBugDrafts({
      rawText: "Broken export button on dashboard",
      creationPlan: {
        planType: "SINGLE_FEATURE",
        rationale: "x",
        confidence: 0.5,
        items: [
          {
            key: "feat-1",
            hubEntityType: "Feature",
            title: "Export",
            storyType: "FUNCTIONAL"
          }
        ]
      }
    });
    expect(drafts.items).toHaveLength(1);
    expect(drafts.items[0]!.storyType).toBe("BUG");
    expect(drafts.items[0]!.title).toMatch(/Broken export/i);
  });
});
