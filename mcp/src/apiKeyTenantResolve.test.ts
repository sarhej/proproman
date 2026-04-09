import { afterEach, describe, expect, it, vi } from "vitest";

const drdFetch = vi.fn();

vi.mock("./api.js", () => ({
  drdFetch: (...a: unknown[]) => drdFetch(...a),
  setApiKeyBridgeTenantId: vi.fn(),
  clearApiKeyBridgeTenant: vi.fn(),
  getBaseUrl: () => "http://hub",
  hasApiKey: () => true
}));

import { resolveTenantIdForWorkspaceSlug } from "./apiKeyTenantResolve.js";

describe("resolveTenantIdForWorkspaceSlug", () => {
  afterEach(() => {
    drdFetch.mockReset();
  });

  it("returns tenant id when slug matches ACTIVE membership (case-insensitive)", async () => {
    drdFetch.mockResolvedValueOnce({
      tenants: [{ tenant: { id: "tid-1", slug: "Acme-Corp", status: "ACTIVE" } }]
    });
    await expect(resolveTenantIdForWorkspaceSlug("acme-corp")).resolves.toBe("tid-1");
    expect(drdFetch).toHaveBeenCalledWith("/api/me/tenants");
  });

  it("throws when slug not in memberships", async () => {
    drdFetch.mockResolvedValueOnce({
      tenants: [{ tenant: { id: "tid-1", slug: "other", status: "ACTIVE" } }]
    });
    await expect(resolveTenantIdForWorkspaceSlug("wanted")).rejects.toThrow(/no ACTIVE membership/);
  });

  it("throws when tenant is not ACTIVE", async () => {
    drdFetch.mockResolvedValueOnce({
      tenants: [{ tenant: { id: "tid-1", slug: "demo", status: "SUSPENDED" } }]
    });
    await expect(resolveTenantIdForWorkspaceSlug("demo")).rejects.toThrow(/no ACTIVE membership/);
  });
});
