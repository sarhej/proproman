import { describe, it, expect } from "vitest";
import { FeatureStatus, StoryType } from "@prisma/client";
import { featureSchema } from "./features.js";

describe("features API – validation edge cases", () => {
  describe("POST body (full schema)", () => {
    it("accepts minimal valid body (title only)", () => {
      const result = featureSchema.safeParse({ title: "New feature" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("New feature");
        expect(result.data.status).toBe(FeatureStatus.IDEA);
        expect(result.data.sortOrder).toBe(0);
      }
    });

    it("accepts full valid body", () => {
      const result = featureSchema.safeParse({
        title: "Full feature",
        description: "Desc",
        acceptanceCriteria: "AC1",
        storyPoints: 5,
        storyType: StoryType.FUNCTIONAL,
        ownerId: "user-1",
        status: FeatureStatus.IN_PROGRESS,
        sortOrder: 2
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.storyPoints).toBe(5);
        expect(result.data.storyType).toBe(StoryType.FUNCTIONAL);
        expect(result.data.status).toBe(FeatureStatus.IN_PROGRESS);
      }
    });

    it("rejects missing title", () => {
      const result = featureSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects empty title", () => {
      const result = featureSchema.safeParse({ title: "" });
      expect(result.success).toBe(false);
    });

    it("rejects invalid status", () => {
      const result = featureSchema.safeParse({
        title: "X",
        status: "ARCHIVED"
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid storyType", () => {
      const result = featureSchema.safeParse({
        title: "X",
        storyType: "EPIC"
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative storyPoints", () => {
      const result = featureSchema.safeParse({
        title: "X",
        storyPoints: -1
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer storyPoints", () => {
      const result = featureSchema.safeParse({
        title: "X",
        storyPoints: 2.5
      });
      expect(result.success).toBe(false);
    });

    it("accepts null for optional nullable fields", () => {
      const result = featureSchema.safeParse({
        title: "X",
        description: null,
        acceptanceCriteria: null,
        storyPoints: null,
        storyType: null,
        ownerId: null
      });
      expect(result.success).toBe(true);
    });

    it("accepts negative sortOrder (schema allows any integer)", () => {
      const result = featureSchema.safeParse({
        title: "X",
        sortOrder: -1
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.sortOrder).toBe(-1);
    });
  });

  describe("PUT body (partial schema)", () => {
    const partialSchema = featureSchema.partial();

    it("accepts empty object", () => {
      const result = partialSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts single field update", () => {
      const result = partialSchema.safeParse({ status: FeatureStatus.DONE });
      expect(result.success).toBe(true);
    });

    it("accepts status BUSINESS_APPROVAL (string from client)", () => {
      const result = partialSchema.safeParse({ status: "BUSINESS_APPROVAL" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.status).toBe("BUSINESS_APPROVAL");
    });

    it("rejects partial title empty string", () => {
      const result = partialSchema.safeParse({ title: "" });
      expect(result.success).toBe(false);
    });
  });
});
