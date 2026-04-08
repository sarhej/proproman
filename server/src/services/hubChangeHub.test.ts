import { describe, expect, it, vi } from "vitest";
import { notifyHubChange, subscribeHubChanges } from "./hubChangeHub.js";

describe("hubChangeHub", () => {
  it("notifies subscribers for a tenant", () => {
    const fn = vi.fn();
    const unsub = subscribeHubChanges("t1", fn);
    const ev = notifyHubChange({
      tenantId: "t1",
      entityType: "INITIATIVE",
      operation: "UPDATE",
      entityId: "i1",
      initiativeId: "i1"
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].eventId).toBe(ev.eventId);
    expect(fn.mock.calls[0][0].entityType).toBe("INITIATIVE");
    unsub();
    notifyHubChange({
      tenantId: "t1",
      entityType: "INITIATIVE",
      operation: "DELETE",
      entityId: "i2",
      initiativeId: "i2"
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("isolates tenants", () => {
    const fn = vi.fn();
    subscribeHubChanges("ta", fn);
    notifyHubChange({
      tenantId: "tb",
      entityType: "FEATURE",
      operation: "CREATE",
      entityId: "f1",
      initiativeId: "i1"
    });
    expect(fn).not.toHaveBeenCalled();
  });
});
