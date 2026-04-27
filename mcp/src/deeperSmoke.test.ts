import { describe, expect, it } from "vitest";
import { assertDiscoveryToolNames, assertWorkspaceToolNames } from "./deeperSmoke.js";

describe("assertDiscoveryToolNames", () => {
  it("passes when routing + workspaces present", () => {
    const r = assertDiscoveryToolNames(
      new Set(["tymio_list_my_workspaces", "tymio_mcp_routing_guide"])
    );
    expect(r).toEqual({ ok: true });
  });

  it("fails when a required tool is missing", () => {
    const r = assertDiscoveryToolNames(new Set(["tymio_list_my_workspaces"]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("tymio_mcp_routing_guide");
  });
});

describe("assertWorkspaceToolNames", () => {
  it("passes when tymio_health exists", () => {
    const r = assertWorkspaceToolNames(new Set(["tymio_health", "tymio_list_initiatives"]));
    expect(r).toEqual({ ok: true });
  });

  it("fails when no workspace markers exist", () => {
    const r = assertWorkspaceToolNames(new Set(["tymio_list_my_workspaces"]));
    expect(r.ok).toBe(false);
  });
});
