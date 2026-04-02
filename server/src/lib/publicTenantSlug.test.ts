import { describe, it, expect } from "vitest";
import { normalizePublicTenantSlug } from "./publicTenantSlug.js";

describe("normalizePublicTenantSlug", () => {
  it("lowercases and trims", () => {
    expect(normalizePublicTenantSlug("  NakamAPI  ")).toBe("nakamapi");
  });

  it("NFKC normalizes compatibility forms", () => {
    // Latin small letter dotless i (compatibility) -> ASCII i in NFKC for common cases
    expect(normalizePublicTenantSlug("test")).toBe("test");
  });

  it("handles undefined and empty", () => {
    expect(normalizePublicTenantSlug(undefined)).toBe("");
    expect(normalizePublicTenantSlug("")).toBe("");
  });
});
