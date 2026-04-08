import { describe, it, expect, beforeEach } from "vitest";
import {
  clearWorkspaceTenantSession,
  ensureWorkspaceTenantSession,
  getWorkspaceTenantIdForApi,
  setWorkspaceTenantSessionForTab,
} from "./workspaceTenantHeader";

describe("workspaceTenantHeader", () => {
  beforeEach(() => {
    clearWorkspaceTenantSession();
    sessionStorage.clear();
  });

  it("sets tab tenant and returns it for API header", () => {
    setWorkspaceTenantSessionForTab("tenant-a");
    expect(getWorkspaceTenantIdForApi()).toBe("tenant-a");
  });

  it("ensureWorkspaceTenantSession does not overwrite an existing tab choice (multi-tab)", () => {
    setWorkspaceTenantSessionForTab("tab-local-1");
    ensureWorkspaceTenantSession("server-default-2");
    expect(getWorkspaceTenantIdForApi()).toBe("tab-local-1");
  });

  it("ensureWorkspaceTenantSession seeds from server when storage is empty", () => {
    ensureWorkspaceTenantSession("server-9");
    expect(getWorkspaceTenantIdForApi()).toBe("server-9");
  });

  it("clearWorkspaceTenantSession removes override", () => {
    setWorkspaceTenantSessionForTab("x");
    clearWorkspaceTenantSession();
    expect(getWorkspaceTenantIdForApi()).toBeUndefined();
  });
});
