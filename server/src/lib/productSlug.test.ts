import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  slugify,
  isValidProductSlug,
  tryParseProductSlug,
  allocateUniqueProductSlug
} from "./productSlug.js";

describe("slugify", () => {
  it("normalizes diacritics and punctuation", () => {
    expect(slugify("Integrační platforma")).toBe("integracni-platforma");
    expect(slugify("My  Cool!!!Product")).toBe("my-cool-product");
  });

  it("returns product for empty-after-strip input", () => {
    expect(slugify("!!!")).toBe("product");
  });
});

describe("isValidProductSlug / tryParseProductSlug", () => {
  it("accepts hyphenated lowercase alphanumerics", () => {
    expect(isValidProductSlug("a-b-1")).toBe(true);
    expect(tryParseProductSlug("  X-Y  ")).toBe("x-y");
  });

  it("rejects uppercase and invalid chars", () => {
    expect(isValidProductSlug("Ab")).toBe(false);
    expect(tryParseProductSlug("a b")).toBeNull();
  });
});

describe("allocateUniqueProductSlug", () => {
  const findFirst = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns base when free", async () => {
    findFirst.mockResolvedValueOnce(null);
    const slug = await allocateUniqueProductSlug(
      { product: { findFirst } as never },
      { tenantId: "t1", fromName: "Hello World", explicitSlug: null }
    );
    expect(slug).toBe("hello-world");
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("suffixes when taken", async () => {
    findFirst.mockResolvedValueOnce({ id: "x" }).mockResolvedValueOnce(null);
    const slug = await allocateUniqueProductSlug(
      { product: { findFirst } as never },
      { tenantId: "t1", fromName: "Same", explicitSlug: null }
    );
    expect(slug).toBe("same-2");
  });
});
