import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HubChangeEventPayload } from "../services/hubChangeHub.js";
import { createWorkspaceAtlasHubRebuildScheduler } from "./hubListener.js";

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
  });

  afterEach(() => {
    vi.useRealTimers();
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

    await vi.advanceTimersByTimeAsync(200);
    expect(compile).toHaveBeenCalledTimes(1);
    expect(compile).toHaveBeenCalledWith("t1");
  });

  it("schedules independent debounces per tenant", async () => {
    const compile = vi.fn().mockResolvedValue(undefined);
    const handler = createWorkspaceAtlasHubRebuildScheduler({ debounceMs: 100, compile });

    handler(hubEv({ tenantId: "a" }));
    handler(hubEv({ tenantId: "b" }));

    await vi.advanceTimersByTimeAsync(100);
    expect(compile).toHaveBeenCalledTimes(2);
    expect(compile.mock.calls.map((c) => c[0]).sort()).toEqual(["a", "b"]);
  });
});
