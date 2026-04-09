import { describe, expect, it } from "vitest";
import { suggestSlugFromEmailDomain } from "./workspaceSlugFromEmail";

describe("suggestSlugFromEmailDomain", () => {
  it("returns acme from acme.com", () => {
    expect(suggestSlugFromEmailDomain("jane@acme.com")).toBe("acme");
  });
  it("returns null for gmail", () => {
    expect(suggestSlugFromEmailDomain("jane@gmail.com")).toBeNull();
  });
  it("returns null for onmicrosoft", () => {
    expect(suggestSlugFromEmailDomain("jane@contoso.onmicrosoft.com")).toBeNull();
  });
});
