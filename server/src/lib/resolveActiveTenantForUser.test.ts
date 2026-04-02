import { describe, it, expect, vi, beforeEach } from "vitest";
import { MembershipRole } from "@prisma/client";
import { APP_LOCALE_CODES } from "./appLocales.js";
import { resolveActiveTenantForAuthenticatedUser } from "./resolveActiveTenantForUser.js";

const { mockMembershipFindUnique } = vi.hoisted(() => ({
  mockMembershipFindUnique: vi.fn(),
}));

vi.mock("../db.js", () => ({
  prisma: {
    tenantMembership: { findUnique: mockMembershipFindUnique },
  },
}));

describe("resolveActiveTenantForAuthenticatedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when candidate id is missing", async () => {
    await expect(resolveActiveTenantForAuthenticatedUser("u1", null)).resolves.toBeNull();
    await expect(resolveActiveTenantForAuthenticatedUser("u1", undefined)).resolves.toBeNull();
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when membership is missing (stale activeTenantId)", async () => {
    mockMembershipFindUnique.mockResolvedValue(null);
    await expect(resolveActiveTenantForAuthenticatedUser("u1", "t-stale")).resolves.toBeNull();
  });

  it("returns null when tenant is not ACTIVE", async () => {
    mockMembershipFindUnique.mockResolvedValue({
      role: MembershipRole.MEMBER,
      tenant: {
        id: "t1",
        name: "X",
        slug: "x",
        status: "SUSPENDED",
        isSystem: false,
        settings: null,
      },
    });
    await expect(resolveActiveTenantForAuthenticatedUser("u1", "t1")).resolves.toBeNull();
  });

  it("returns tenant payload when membership is active", async () => {
    mockMembershipFindUnique.mockResolvedValue({
      role: MembershipRole.ADMIN,
      tenant: {
        id: "t1",
        name: "Acme",
        slug: "acme",
        status: "ACTIVE",
        isSystem: false,
        settings: { enabledLocales: ["en", "cs"] },
      },
    });
    await expect(resolveActiveTenantForAuthenticatedUser("u1", "t1")).resolves.toEqual({
      id: "t1",
      name: "Acme",
      slug: "acme",
      status: "ACTIVE",
      isSystem: false,
      enabledLocales: ["en", "cs"],
      membershipRole: MembershipRole.ADMIN,
    });
  });

  it("defaults enabledLocales when settings omit list", async () => {
    mockMembershipFindUnique.mockResolvedValue({
      role: MembershipRole.VIEWER,
      tenant: {
        id: "t1",
        name: "Acme",
        slug: "acme",
        status: "ACTIVE",
        isSystem: false,
        settings: null,
      },
    });
    await expect(resolveActiveTenantForAuthenticatedUser("u1", "t1")).resolves.toMatchObject({
      enabledLocales: [...APP_LOCALE_CODES],
      membershipRole: MembershipRole.VIEWER,
    });
  });
});
