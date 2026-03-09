import { describe, it, expect, vi } from "vitest";

const priorityLabels: Record<string, string> = {
  P0: "Critical",
  P1: "High",
  P2: "Medium",
  P3: "Low"
};

vi.mock("../i18n", () => ({
  default: {
    t: (key: string) => {
      const m = key.match(/^priority\.(P\d)$/);
      return m ? priorityLabels[m[1]] ?? key : key;
    }
  }
}));

const { formatPriority } = await import("./format");

describe("formatPriority", () => {
  it("returns Critical for P0", () => {
    expect(formatPriority("P0")).toBe("Critical");
  });
  it("returns High for P1", () => {
    expect(formatPriority("P1")).toBe("High");
  });
  it("returns Medium for P2", () => {
    expect(formatPriority("P2")).toBe("Medium");
  });
  it("returns Low for P3", () => {
    expect(formatPriority("P3")).toBe("Low");
  });
});
