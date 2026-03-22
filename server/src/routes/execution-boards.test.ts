import { describe, it, expect } from "vitest";
import { BoardProvider, BoardSyncState, TaskStatus } from "@prisma/client";
import {
  columnInputSchema,
  columnReorderSchema,
  createBoardSchema,
  updateBoardSchema,
  updateColumnSchema
} from "./execution-boards.js";

describe("execution-boards API – validation", () => {
  describe("createBoardSchema", () => {
    it("accepts minimal body (name only)", () => {
      const r = createBoardSchema.safeParse({ name: "Delivery" });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.name).toBe("Delivery");
        expect(r.data.provider).toBe(BoardProvider.INTERNAL);
        expect(r.data.isDefault).toBe(true);
      }
    });

    it("accepts explicit provider and isDefault false", () => {
      const r = createBoardSchema.safeParse({
        name: "Sprint",
        provider: BoardProvider.JIRA,
        isDefault: false
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.provider).toBe(BoardProvider.JIRA);
        expect(r.data.isDefault).toBe(false);
      }
    });

    it("accepts custom columns array", () => {
      const r = createBoardSchema.safeParse({
        name: "B",
        columns: [
          { name: "A", sortOrder: 0, mappedStatus: TaskStatus.NOT_STARTED, isDefault: true },
          { name: "B", sortOrder: 1, mappedStatus: TaskStatus.DONE, isDefault: false }
        ]
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.columns).toHaveLength(2);
    });

    it("rejects empty name", () => {
      expect(createBoardSchema.safeParse({ name: "" }).success).toBe(false);
    });

    it("rejects missing name", () => {
      expect(createBoardSchema.safeParse({ provider: BoardProvider.INTERNAL }).success).toBe(false);
    });

    it("rejects columns when empty array (min 1)", () => {
      const r = createBoardSchema.safeParse({ name: "X", columns: [] });
      expect(r.success).toBe(false);
    });

    it("rejects invalid provider", () => {
      const r = createBoardSchema.safeParse({ name: "X", provider: "ASANA" });
      expect(r.success).toBe(false);
    });

    it("accepts null externalRef and config", () => {
      const r = createBoardSchema.safeParse({
        name: "X",
        externalRef: null,
        config: null
      });
      expect(r.success).toBe(true);
    });
  });

  describe("updateBoardSchema", () => {
    it("accepts empty object", () => {
      expect(updateBoardSchema.safeParse({}).success).toBe(true);
    });

    it("accepts syncState only", () => {
      const r = updateBoardSchema.safeParse({ syncState: BoardSyncState.ERROR });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.syncState).toBe(BoardSyncState.ERROR);
    });

    it("rejects empty partial name", () => {
      expect(updateBoardSchema.safeParse({ name: "" }).success).toBe(false);
    });
  });

  describe("columnInputSchema", () => {
    it("accepts minimal column", () => {
      const r = columnInputSchema.safeParse({
        name: "Doing",
        mappedStatus: TaskStatus.IN_PROGRESS
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.sortOrder).toBe(0);
        expect(r.data.isDefault).toBe(false);
      }
    });

    it("rejects empty column name", () => {
      expect(
        columnInputSchema.safeParse({ name: "", mappedStatus: TaskStatus.NOT_STARTED }).success
      ).toBe(false);
    });

    it("rejects invalid mappedStatus", () => {
      expect(
        columnInputSchema.safeParse({ name: "X", mappedStatus: "FOO" as TaskStatus }).success
      ).toBe(false);
    });

    it("rejects non-int sortOrder", () => {
      expect(
        columnInputSchema.safeParse({
          name: "X",
          sortOrder: 1.2,
          mappedStatus: TaskStatus.NOT_STARTED
        }).success
      ).toBe(false);
    });
  });

  describe("updateColumnSchema", () => {
    it("accepts empty partial", () => {
      expect(updateColumnSchema.safeParse({}).success).toBe(true);
    });

    it("accepts mappedStatus only", () => {
      const r = updateColumnSchema.safeParse({ mappedStatus: TaskStatus.TESTING });
      expect(r.success).toBe(true);
    });

    it("rejects partial empty name", () => {
      expect(updateColumnSchema.safeParse({ name: "" }).success).toBe(false);
    });
  });

  describe("columnReorderSchema", () => {
    it("accepts empty array", () => {
      expect(columnReorderSchema.safeParse([]).success).toBe(true);
    });

    it("accepts valid reorder payload", () => {
      const r = columnReorderSchema.safeParse([
        { id: "c1", sortOrder: 1 },
        { id: "c2", sortOrder: 0 }
      ]);
      expect(r.success).toBe(true);
    });

    it("rejects empty column id", () => {
      expect(columnReorderSchema.safeParse([{ id: "", sortOrder: 0 }]).success).toBe(false);
    });

    it("rejects float sortOrder", () => {
      expect(columnReorderSchema.safeParse([{ id: "c1", sortOrder: 0.5 }]).success).toBe(false);
    });
  });
});
