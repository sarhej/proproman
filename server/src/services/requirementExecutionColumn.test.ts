import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskStatus } from "@prisma/client";
import { applyExecutionColumn, productIdForFeature } from "./requirementExecutionColumn.js";
import { prisma } from "../db.js";

vi.mock("../db.js", () => ({
  prisma: {
    feature: { findUnique: vi.fn() },
    executionColumn: { findUnique: vi.fn() }
  }
}));

const mockPrisma = prisma as unknown as {
  feature: { findUnique: ReturnType<typeof vi.fn> };
  executionColumn: { findUnique: ReturnType<typeof vi.fn> };
};

describe("requirementExecutionColumn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("productIdForFeature", () => {
    it("returns productId when feature exists", async () => {
      mockPrisma.feature.findUnique.mockResolvedValue({
        initiative: { productId: "prod-1" }
      });
      await expect(productIdForFeature("feat-1")).resolves.toBe("prod-1");
      expect(mockPrisma.feature.findUnique).toHaveBeenCalledWith({
        where: { id: "feat-1" },
        select: { initiative: { select: { productId: true } } }
      });
    });

    it("returns null when feature missing", async () => {
      mockPrisma.feature.findUnique.mockResolvedValue(null);
      await expect(productIdForFeature("missing")).resolves.toBeNull();
    });

    it("returns null when initiative chain missing", async () => {
      mockPrisma.feature.findUnique.mockResolvedValue({ initiative: null });
      await expect(productIdForFeature("feat-1")).resolves.toBeNull();
    });
  });

  describe("applyExecutionColumn", () => {
    it("returns only executionColumnId null when columnId is null", async () => {
      await expect(applyExecutionColumn("feat-1", null)).resolves.toEqual({
        executionColumnId: null
      });
      expect(mockPrisma.executionColumn.findUnique).not.toHaveBeenCalled();
    });

    it("throws UNKNOWN_COLUMN when column does not exist", async () => {
      mockPrisma.executionColumn.findUnique.mockResolvedValue(null);
      await expect(applyExecutionColumn("feat-1", "col-x")).rejects.toThrow("UNKNOWN_COLUMN");
    });

    it("throws COLUMN_PRODUCT_MISMATCH when product differs", async () => {
      mockPrisma.executionColumn.findUnique.mockResolvedValue({
        id: "col-1",
        mappedStatus: TaskStatus.IN_PROGRESS,
        board: { productId: "prod-a" }
      });
      mockPrisma.feature.findUnique.mockResolvedValue({
        initiative: { productId: "prod-b" }
      });
      await expect(applyExecutionColumn("feat-1", "col-1")).rejects.toThrow("COLUMN_PRODUCT_MISMATCH");
    });

    it("returns status and isDone from mapped DONE column", async () => {
      mockPrisma.executionColumn.findUnique.mockResolvedValue({
        id: "col-done",
        mappedStatus: TaskStatus.DONE,
        board: { productId: "prod-1" }
      });
      mockPrisma.feature.findUnique.mockResolvedValue({
        initiative: { productId: "prod-1" }
      });
      await expect(applyExecutionColumn("feat-1", "col-done")).resolves.toEqual({
        executionColumnId: "col-done",
        status: TaskStatus.DONE,
        isDone: true
      });
    });

    it("returns isDone false for non-DONE mapped status", async () => {
      mockPrisma.executionColumn.findUnique.mockResolvedValue({
        id: "col-2",
        mappedStatus: TaskStatus.TESTING,
        board: { productId: "p1" }
      });
      mockPrisma.feature.findUnique.mockResolvedValue({
        initiative: { productId: "p1" }
      });
      await expect(applyExecutionColumn("feat-1", "col-2")).resolves.toEqual({
        executionColumnId: "col-2",
        status: TaskStatus.TESTING,
        isDone: false
      });
    });

    it("throws COLUMN_PRODUCT_MISMATCH when feature has no product", async () => {
      mockPrisma.executionColumn.findUnique.mockResolvedValue({
        id: "col-1",
        mappedStatus: TaskStatus.NOT_STARTED,
        board: { productId: "prod-1" }
      });
      mockPrisma.feature.findUnique.mockResolvedValue(null);
      await expect(applyExecutionColumn("feat-1", "col-1")).rejects.toThrow("COLUMN_PRODUCT_MISMATCH");
    });
  });
});
