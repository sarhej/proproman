import { describe, expect, it } from "vitest";
import { extractMarkdownSection, headingToAnchor, parseDocPathRef } from "./docExcerpt.js";

describe("docExcerpt", () => {
  it("parses path and anchor", () => {
    expect(parseDocPathRef("docs/HUB.md#12-multi-tenancy-as-implemented")).toEqual({
      filePath: "docs/HUB.md",
      anchor: "12-multi-tenancy-as-implemented"
    });
  });

  it("headingToAnchor matches github style", () => {
    expect(headingToAnchor("1.2 Multi-tenancy (as implemented)")).toBe(
      "12-multi-tenancy-as-implemented"
    );
  });

  it("extractMarkdownSection returns section body", () => {
    const md = `# Top

## 1.2 Multi-tenancy (as implemented)

Line one.

## Next

Other`;
    const section = extractMarkdownSection(md, "12-multi-tenancy-as-implemented");
    expect(section).toContain("Line one");
    expect(section).not.toContain("Other");
  });
});
