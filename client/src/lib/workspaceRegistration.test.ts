import { describe, it, expect } from "vitest";
import { generateWorkspaceSlugFromTeamName } from "./workspaceRegistration";

describe("generateWorkspaceSlugFromTeamName", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(generateWorkspaceSlugFromTeamName("Acme Corp")).toBe("acme-corp");
  });

  it("strips non-alphanumeric except hyphen", () => {
    expect(generateWorkspaceSlugFromTeamName("Foo & Bar!")).toBe("foo-bar");
  });

  it("collapses multiple hyphens and trims edges", () => {
    expect(generateWorkspaceSlugFromTeamName("a  -  b")).toBe("a-b");
  });

  it("caps length at 50", () => {
    const long = "a".repeat(60);
    expect(generateWorkspaceSlugFromTeamName(long).length).toBe(50);
  });
});
