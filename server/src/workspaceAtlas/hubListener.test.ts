import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HubChangeEventPayload } from "../services/hubChangeHub.js";
import { createWorkspaceAtlasHubRebuildScheduler } from "./hubListener.js";
import { isAtlasRebuildPending, resetAtlasRebuildStateForTests } from "./rebuildState.js";

function hubEv(partial: Partial<HubChangeEventPayload> & { tenantId: string }): HubChangeEventPayload {
  return {
    eventId: "00000000-0000-4000-8000-000000000001",
    changedAt: new Date().toISOString(),
    entityType: "INITIATIVE",
    operation: "UPDATE",
    entityId: "e1",
    initiativeId: "e1",
    ...partial
  };
}

describe("createWorkspaceAtlasHubRebuildScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAtlasRebuildStateForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAtlasRebuildStateForTests();
  });

  it("calls compile once after debounce when notifyHubChange-equivalent events fire", async () => {
    const compile = vi.fn().mockResolvedValue(undefined);
    const handler = createWorkspaceAtlasHubRebuildScheduler({ debounceMs: 100, compile });

    handler(hubEv({ tenantId: "tenant-a" }));
    expect(compile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(99);
    expect(compile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2);
    expect(compile).toHaveBeenCalledTimes(1);
    expect(compile).toHaveBeenCalledWith("tenant-a");
  });

  it("debounces rapid events for the same tenant to a single compile", async () => {
    const compile = vi.fn().mockResolvedValue(undefined);
    const handler = createWorkspaceAtlasHubRebuildScheduler({ debounceMs: 200, compile });

    handler(hubEv({ tenantId: "t1", entityType: "FEATURE", operation: "CREATE" }));
    await vi.advanceTimersByTimeAsync(50);
    handler(hubEv({ tenantId: "t1", entityType: "REQUIREMENT", operation: "UPDATE" }));
    await vi.advanceTimersByTimeAsync(50);
    handler(hubEv({ tenantId: "t1", entityType: "INITIATIVE", operation: "UPDATE" }));
    expect(compile).not.toHaveBeenCalled();
    expect(isAtlasRebuildPending("t1")).toBe(true);

    await vi.advanceTimersByTimeAsync(200);
    expect(compile).toHaveBeenCalledTimes(1);
    expect(compile).toHaveBeenCalledWith("t1");
  });

  it("schedules independent debounces per tenant", async () => {
    const compile = vi.fn().mockResolvedValue(undefined);
    const handler = createWorkspaceAtlasHubRebuildScheduler({ debounceMs: 100, compile });

    handler(hubEv({ tenantId: "a" }));
    handler(hubEv({ tenantId: "b" }));
    expect(isAtlasRebuildPending("a")).toBe(true);
    expect(isAtlasRebuildPending("b")).toBe(true);

    await vi.advanceTimersByTimeAsync(100);
    expect(compile).toHaveBeenCalledTimes(2);
    expect(compile.mock.calls.map((c) => c[0]).sort()).toEqual(["a", "b"]);
  });

  it("marks rebuild pending while debounce is waiting", async () => {
    const compile = vi.fn().mockResolvedValue(undefined);
    const handler = createWorkspaceAtlasHubRebuildScheduler({ debounceMs: 100, compile });

    handler(hubEv({ tenantId: "tenant-a" }));
    expect(isAtlasRebuildPending("tenant-a")).toBe(true);

    await vi.advanceTimersByTimeAsync(100);
    expect(compile).toHaveBeenCalledTimes(1);
  });

  it("clears pending when mocked compile rejects without starting real compile", async () => {
    const compile = vi.fn().mockRejectedValue(new Error("compile boom"));
    const handler = createWorkspaceAtlasHubRebuildScheduler({ debounceMs: 50, compile });

    handler(hubEv({ tenantId: "tenant-x" }));
    expect(isAtlasRebuildPending("tenant-x")).toBe(true);

    await vi.advanceTimersByTimeAsync(50);
    await vi.runAllTimersAsync();
    expect(compile).toHaveBeenCalledTimes(1);
    expect(isAtlasRebuildPending("tenant-x")).toBe(false);
  });

  it("keeps other tenant pending when one tenant compile fails", async () => {
    const compile = vi.fn().mockImplementation(async (tenantId: string) => {
      if (tenantId === "fail") throw new Error("fail");
    });
    const handler = createWorkspaceAtlasHubRebuildScheduler({ debounceMs: 50, compile });

    handler(hubEv({ tenantId: "fail" }));
    handler(hubEv({ tenantId: "ok" }));
    await vi.advanceTimersByTimeAsync(25);
    // re-arm ok so it remains pending after fail's timer fires
    handler(hubEv({ tenantId: "ok" }));
    await vi.advanceTimersByTimeAsync(50);
    await vi.runAllTimersAsync();

    expect(isAtlasRebuildPending("fail")).toBe(false);
    expect(isAtlasRebuildPending("ok")).toBe(true);
  });
});
