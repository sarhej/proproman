import { describe, it, expect, beforeEach } from "vitest";
import {
  clearAtlasRebuildPending,
  computeAtlasHealth,
  getTenantAtlasRebuildMeta,
  isAtlasCompiling,
  isAtlasRebuildPending,
  markAtlasCompileFailed,
  markAtlasCompileStarted,
  markAtlasCompileSucceeded,
  markAtlasRebuildPending,
  resetAtlasRebuildStateForTests
} from "./rebuildState.js";

describe("atlas rebuildState edge cases", () => {
  beforeEach(() => {
    resetAtlasRebuildStateForTests();
  });

  describe("lifecycle transitions", () => {
    it("pending → compiling clears pending and sets compiling", () => {
      markAtlasRebuildPending("t1");
      expect(isAtlasRebuildPending("t1")).toBe(true);
      markAtlasCompileStarted("t1");
      expect(isAtlasRebuildPending("t1")).toBe(false);
      expect(isAtlasCompiling("t1")).toBe(true);
    });

    it("success clears compiling, pending, and prior error; sets lastRebuildAt", () => {
      markAtlasCompileFailed("t1", "boom");
      markAtlasRebuildPending("t1");
      markAtlasCompileStarted("t1");
      markAtlasCompileSucceeded("t1");
      const meta = getTenantAtlasRebuildMeta("t1");
      expect(meta.compiling).toBe(false);
      expect(meta.pendingRebuild).toBe(false);
      expect(meta.lastErrorMessage).toBeNull();
      expect(meta.lastRebuildAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("failure clears compiling but keeps lastErrorMessage", () => {
      markAtlasCompileStarted("t1");
      markAtlasCompileFailed("t1", "disk full");
      expect(isAtlasCompiling("t1")).toBe(false);
      expect(getTenantAtlasRebuildMeta("t1").lastErrorMessage).toBe("disk full");
    });

    it("clearAtlasRebuildPending only affects pending flag", () => {
      markAtlasRebuildPending("t1");
      markAtlasCompileStarted("t1");
      markAtlasCompileFailed("t1", "x");
      markAtlasRebuildPending("t1");
      clearAtlasRebuildPending("t1");
      expect(isAtlasRebuildPending("t1")).toBe(false);
      expect(getTenantAtlasRebuildMeta("t1").lastErrorMessage).toBe("x");
    });
  });

  describe("multi-tenant isolation", () => {
    it("does not leak pending/compiling/error across tenants", () => {
      markAtlasRebuildPending("t1");
      markAtlasCompileStarted("t2");
      markAtlasCompileFailed("t3", "only-t3");

      expect(computeAtlasHealth({ tenantId: "t1", compiled: true, isStale: false }).status).toBe(
        "rebuilding"
      );
      expect(computeAtlasHealth({ tenantId: "t2", compiled: true, isStale: false }).status).toBe(
        "rebuilding"
      );
      expect(computeAtlasHealth({ tenantId: "t3", compiled: true, isStale: false })).toMatchObject({
        status: "error",
        lastErrorMessage: "only-t3"
      });
      expect(computeAtlasHealth({ tenantId: "t4", compiled: true, isStale: false }).status).toBe(
        "current"
      );
    });

    it("success on one tenant does not clear another tenant error", () => {
      markAtlasCompileFailed("t1", "a");
      markAtlasCompileFailed("t2", "b");
      markAtlasCompileSucceeded("t1");
      expect(getTenantAtlasRebuildMeta("t1").lastErrorMessage).toBeNull();
      expect(getTenantAtlasRebuildMeta("t2").lastErrorMessage).toBe("b");
    });
  });

  describe("status priority", () => {
    it("incomplete wins over pending rebuild", () => {
      markAtlasRebuildPending("t1");
      expect(computeAtlasHealth({ tenantId: "t1", compiled: false, isStale: true })).toMatchObject({
        status: "incomplete",
        pendingRebuild: true
      });
    });

    it("incomplete wins over error and stale", () => {
      markAtlasCompileFailed("t1", "err");
      expect(computeAtlasHealth({ tenantId: "t1", compiled: false, isStale: true }).status).toBe(
        "incomplete"
      );
    });

    it("rebuilding wins over error and stale", () => {
      markAtlasCompileFailed("t1", "err");
      markAtlasRebuildPending("t1");
      expect(computeAtlasHealth({ tenantId: "t1", compiled: true, isStale: true }).status).toBe(
        "rebuilding"
      );
      resetAtlasRebuildStateForTests();
      markAtlasCompileFailed("t1", "err");
      markAtlasCompileStarted("t1");
      expect(computeAtlasHealth({ tenantId: "t1", compiled: true, isStale: true }).status).toBe(
        "rebuilding"
      );
    });

    it("error wins over stale when idle", () => {
      markAtlasCompileFailed("t1", "compile failed");
      expect(computeAtlasHealth({ tenantId: "t1", compiled: true, isStale: true })).toMatchObject({
        status: "error",
        lastErrorMessage: "compile failed"
      });
    });

    it("stale when compiled, idle, no error, source newer", () => {
      expect(computeAtlasHealth({ tenantId: "t1", compiled: true, isStale: true }).status).toBe(
        "stale"
      );
    });

    it("current when compiled, idle, no error, not stale", () => {
      markAtlasCompileSucceeded("t1");
      expect(computeAtlasHealth({ tenantId: "t1", compiled: true, isStale: false }).status).toBe(
        "current"
      );
    });
  });

  describe("computeAtlasHealth (baseline)", () => {
    it("returns incomplete when not compiled", () => {
      expect(computeAtlasHealth({ tenantId: "t1", compiled: false, isStale: false }).status).toBe(
        "incomplete"
      );
    });

    it("returns rebuilding when pending or compiling", () => {
      markAtlasRebuildPending("t1");
      expect(computeAtlasHealth({ tenantId: "t1", compiled: true, isStale: true }).status).toBe(
        "rebuilding"
      );
      resetAtlasRebuildStateForTests();
      markAtlasCompileStarted("t1");
      expect(computeAtlasHealth({ tenantId: "t1", compiled: true, isStale: false }).status).toBe(
        "rebuilding"
      );
    });

    it("returns error after failed compile (cleared on success)", () => {
      markAtlasCompileFailed("t1", "disk full");
      expect(computeAtlasHealth({ tenantId: "t1", compiled: true, isStale: false })).toMatchObject({
        status: "error",
        lastErrorMessage: "disk full"
      });
      markAtlasCompileSucceeded("t1");
      expect(computeAtlasHealth({ tenantId: "t1", compiled: true, isStale: false }).status).toBe(
        "current"
      );
    });
  });
});
