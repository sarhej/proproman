import { describe, it, expect } from "vitest";
import { IntakeMode } from "@prisma/client";
import { buildHeuristicCreationPlan, splitIdeaChunks } from "./planner.js";
import { creationPlanSchema, normalizeCreationPlan } from "./creationPlanSchema.js";

describe("splitIdeaChunks", () => {
  it("splits numbered lists", () => {
    const chunks = splitIdeaChunks("1. Alpha thing\n2. Beta thing\n3. Gamma");
    expect(chunks.length).toBe(3);
  });

  it("splits blank-line paragraphs", () => {
    expect(splitIdeaChunks("One idea here.\n\nAnother idea there.")).toHaveLength(2);
  });

  it("keeps single block", () => {
    expect(splitIdeaChunks("Just one idea with details.")).toEqual(["Just one idea with details."]);
  });
});

describe("buildHeuristicCreationPlan", () => {
  it("maps BUG mode to Feature storyType BUG", () => {
    const plan = buildHeuristicCreationPlan({
      mode: IntakeMode.BUG,
      rawText: "Login CTA is clipped on iPhone SE after rotate in landscape mode with long labels."
    });
    expect(plan.planType).toBe("SINGLE_BUG_FEATURE");
    expect(plan.items[0]?.hubEntityType).toBe("Feature");
    expect(plan.items[0]?.storyType).toBe("BUG");
    expect(creationPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("asks clarification when vague without answers", () => {
    const plan = buildHeuristicCreationPlan({
      mode: IntakeMode.FEATURE,
      rawText: "Improve things"
    });
    expect(plan.needsClarification).toBe(true);
    expect(plan.clarificationQuestions?.length).toBeGreaterThan(0);
    expect(plan.confidence).toBeLessThanOrEqual(0.45);
  });

  it("builds INITIATIVE_TREE for many chunks", () => {
    const plan = buildHeuristicCreationPlan({
      mode: IntakeMode.FEATURE,
      rawText: "1. Shared intake shell\n2. Planner service\n3. Draft review UI\n4. URL fetch"
    });
    expect(plan.planType).toBe("INITIATIVE_TREE");
    expect(plan.items.some((i) => i.hubEntityType === "Initiative")).toBe(true);
    expect(plan.items.filter((i) => i.hubEntityType === "Feature").length).toBeGreaterThanOrEqual(3);
  });

  it("applies clarification answers to skip vagueness gate", () => {
    const plan = buildHeuristicCreationPlan({
      mode: IntakeMode.FEATURE,
      rawText: "Improve intake",
      clarificationAnswers: { persona: "PO", outcome: "Create Bug works", kind: "Feature" }
    });
    expect(plan.needsClarification).toBeFalsy();
    expect(plan.items[0]?.hubEntityType).toBe("Feature");
  });

  it("normalize drops dangling parentKey", () => {
    const plan = normalizeCreationPlan({
      planType: "SINGLE_FEATURE",
      rationale: "test",
      confidence: 0.5,
      items: [
        {
          key: "feat-1",
          hubEntityType: "Feature",
          title: "X",
          parentKey: "missing",
          storyType: "FUNCTIONAL"
        }
      ]
    });
    expect(plan.items[0]?.parentKey).toBeNull();
  });
});
