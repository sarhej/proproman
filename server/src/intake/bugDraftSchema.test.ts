import { describe, it, expect } from "vitest";
import {
  normalizeBugDraft,
  severityToPriority,
  bugDraftSchema,
  normalizeIntakeDrafts
} from "./bugDraftSchema.js";

describe("severityToPriority", () => {
  it("maps severity table", () => {
    expect(severityToPriority("CRITICAL")).toBe("P0");
    expect(severityToPriority("HIGH")).toBe("P1");
    expect(severityToPriority("MEDIUM")).toBe("P2");
    expect(severityToPriority("LOW")).toBe("P3");
  });
});

describe("normalizeBugDraft", () => {
  const base = {
    key: "bug-1",
    hubEntityType: "Feature" as const,
    storyType: "BUG" as const,
    title: "Login clipped",
    severity: "HIGH" as const,
    priority: "P3" as const,
    fieldProvenance: { priority: "ai" as const, severity: "ai" as const }
  };

  it("resyncs priority from severity when priority is AI-owned", () => {
    const n = normalizeBugDraft(bugDraftSchema.parse(base));
    expect(n.priority).toBe("P1");
  });

  it("keeps user-overridden priority", () => {
    const n = normalizeBugDraft(
      bugDraftSchema.parse({
        ...base,
        priority: "P0",
        fieldProvenance: { priority: "user", severity: "ai" }
      })
    );
    expect(n.priority).toBe("P0");
    expect(n.severity).toBe("HIGH");
  });

  it("normalizeIntakeDrafts validates list", () => {
    const out = normalizeIntakeDrafts({
      items: [bugDraftSchema.parse(base)],
      source: "heuristic"
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.priority).toBe("P1");
  });
});
