import { describe, it, expect } from "vitest";
import { Priority, TaskStatus, TaskType } from "@prisma/client";
import { requirementSchema } from "./requirements.js";

describe("requirements API – validation edge cases", () => {
  describe("POST body (full schema)", () => {
    it("accepts minimal valid body (featureId + title)", () => {
      const result = requirementSchema.safeParse({
        featureId: "feat-1",
        title: "Do something"
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.featureId).toBe("feat-1");
        expect(result.data.title).toBe("Do something");
        expect(result.data.status).toBe(TaskStatus.NOT_STARTED);
        expect(result.data.isDone).toBe(false);
        expect(result.data.priority).toBe(Priority.P2);
        expect(result.data.sortOrder).toBe(0);
      }
    });

    it("accepts full valid body with all optional fields", () => {
      const result = requirementSchema.safeParse({
        featureId: "feat-1",
        title: "Full task",
        description: "Details here",
        status: TaskStatus.IN_PROGRESS,
        isDone: false,
        priority: Priority.P0,
        assigneeId: "user-1",
        dueDate: "2025-12-31T23:59:59.000Z",
        estimate: "2h",
        labels: ["Urgent", "backend", "urgent"],
        taskType: TaskType.TASK,
        blockedReason: null,
        externalRef: "JIRA-123",
        metadata: { source: "import" },
        sortOrder: 1
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(TaskStatus.IN_PROGRESS);
        expect(result.data.priority).toBe(Priority.P0);
        expect(result.data.labels).toEqual(["urgent", "backend"]);
        expect(result.data.metadata).toEqual({ source: "import" });
      }
    });

    it("rejects missing featureId", () => {
      const result = requirementSchema.safeParse({ title: "No feature" });
      expect(result.success).toBe(false);
    });

    it("rejects empty featureId", () => {
      const result = requirementSchema.safeParse({ featureId: "", title: "X" });
      expect(result.success).toBe(false);
    });

    it("rejects missing title", () => {
      const result = requirementSchema.safeParse({ featureId: "feat-1" });
      expect(result.success).toBe(false);
    });

    it("rejects empty title", () => {
      const result = requirementSchema.safeParse({ featureId: "feat-1", title: "" });
      expect(result.success).toBe(false);
    });

    it("rejects invalid status", () => {
      const result = requirementSchema.safeParse({
        featureId: "feat-1",
        title: "X",
        status: "INVALID_STATUS"
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid priority", () => {
      const result = requirementSchema.safeParse({
        featureId: "feat-1",
        title: "X",
        priority: "P99"
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid taskType", () => {
      const result = requirementSchema.safeParse({
        featureId: "feat-1",
        title: "X",
        taskType: "INVALID_TYPE"
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-ISO dueDate", () => {
      const result = requirementSchema.safeParse({
        featureId: "feat-1",
        title: "X",
        dueDate: "tomorrow"
      });
      expect(result.success).toBe(false);
    });

    it("accepts null for optional nullable fields", () => {
      const result = requirementSchema.safeParse({
        featureId: "feat-1",
        title: "X",
        description: null,
        assigneeId: null,
        dueDate: null,
        estimate: null,
        labels: null,
        taskType: null,
        blockedReason: null,
        externalRef: null,
        metadata: null
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty labels array", () => {
      const result = requirementSchema.safeParse({
        featureId: "feat-1",
        title: "X",
        labels: []
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.labels).toEqual([]);
    });

    it("rejects labels when not array of strings", () => {
      const result = requirementSchema.safeParse({
        featureId: "feat-1",
        title: "X",
        labels: [1, 2]
      });
      expect(result.success).toBe(false);
    });

    it("accepts negative sortOrder (schema allows any integer)", () => {
      const result = requirementSchema.safeParse({
        featureId: "feat-1",
        title: "X",
        sortOrder: -1
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.sortOrder).toBe(-1);
    });

    it("rejects non-integer sortOrder", () => {
      const result = requirementSchema.safeParse({
        featureId: "feat-1",
        title: "X",
        sortOrder: 1.5
      });
      expect(result.success).toBe(false);
    });
  });

  describe("PUT body (partial schema)", () => {
    const partialSchema = requirementSchema.partial();

    it("accepts empty object (no-op update)", () => {
      const result = partialSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts single field update (status)", () => {
      const result = partialSchema.safeParse({ status: TaskStatus.DONE });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.status).toBe(TaskStatus.DONE);
    });

    it("accepts isDone true", () => {
      const result = partialSchema.safeParse({ isDone: true });
      expect(result.success).toBe(true);
    });

    it("rejects invalid status in partial", () => {
      const result = partialSchema.safeParse({ status: "DONE" as TaskStatus }); // valid
      expect(result.success).toBe(true);
      const bad = partialSchema.safeParse({ status: "INVALID" });
      expect(bad.success).toBe(false);
    });

    it("rejects partial title empty string", () => {
      const result = partialSchema.safeParse({ title: "" });
      expect(result.success).toBe(false);
    });
  });
});
