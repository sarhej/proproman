import { describe, it, expect } from "vitest";
import { TopLevelItemType } from "@prisma/client";
import { productSchema, productSlugField } from "./products.js";

describe("products API – slug & body validation", () => {
  describe("productSlugField", () => {
    it("accepts lowercase hyphenated slugs", () => {
      expect(productSlugField.safeParse("my-product-1").success).toBe(true);
    });

    it("rejects uppercase", () => {
      expect(productSlugField.safeParse("My-Product").success).toBe(false);
    });

    it("rejects spaces and underscores", () => {
      expect(productSlugField.safeParse("my product").success).toBe(false);
      expect(productSlugField.safeParse("my_product").success).toBe(false);
    });

    it("rejects empty and trailing hyphen segments", () => {
      expect(productSlugField.safeParse("").success).toBe(false);
      expect(productSlugField.safeParse("a--b").success).toBe(false);
      expect(productSlugField.safeParse("-ab").success).toBe(false);
    });
  });

  describe("productSchema (create)", () => {
    it("accepts name only (slug optional)", () => {
      const r = productSchema.safeParse({ name: "Hello" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.slug).toBeUndefined();
    });

    it("accepts explicit valid slug", () => {
      const r = productSchema.safeParse({ name: "Hello", slug: "hello-line" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.slug).toBe("hello-line");
    });

    it("accepts itemType SYSTEM", () => {
      const r = productSchema.safeParse({
        name: "Sys",
        itemType: TopLevelItemType.SYSTEM,
        sortOrder: 3
      });
      expect(r.success).toBe(true);
    });
  });

  describe("productSchema.partial (update)", () => {
    it("accepts empty object", () => {
      expect(productSchema.partial().safeParse({}).success).toBe(true);
    });

    it("accepts slug-only patch", () => {
      const r = productSchema.partial().safeParse({ slug: "new-slug" });
      expect(r.success).toBe(true);
    });
  });
});
