import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { UserRole } from "@prisma/client";

const { mockTenantFindFirst, mockUserFindUnique, mockMembershipFindUnique } = vi.hoisted(() => ({
  mockTenantFindFirst: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
}));

vi.mock("../db.js", () => ({
  prismaUnscoped: {
    tenant: { findFirst: mockTenantFindFirst },
    user: { findUnique: mockUserFindUnique },
    tenantMembership: { findUnique: mockMembershipFindUnique },
  },
}));

import { resolveMcpTenantContextFromWorkspaceSlug } from "./resolveMcpTenantContext.js";

function authInfo(extra: AuthInfo["extra"]): AuthInfo {
  return { token: "t", clientId: "c", scopes: [], extra } as AuthInfo;
}

function createReq(headers: Record<string, string | undefined>): Pick<Request, "headers"> {
  return { headers } as Pick<Request, "headers">;
}

describe("resolveMcpTenantContextFromWorkspaceSlug", () => {
  const verifyAccessToken = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined when slug normalizes to empty", async () => {
    const result = await resolveMcpTenantContextFromWorkspaceSlug(
      createReq({}),
      "   ",
      verifyAccessToken
    );
    expect(result).toBeUndefined();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("returns undefined when Authorization is missing", async () => {
    const result = await resolveMcpTenantContextFromWorkspaceSlug(
      createReq({}),
      "acme",
      verifyAccessToken
    );
    expect(result).toBeUndefined();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("returns undefined when tenant is not found", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    mockTenantFindFirst.mockResolvedValue(null);

    const result = await resolveMcpTenantContextFromWorkspaceSlug(
      createReq({ authorization: "Bearer tok" }),
      "missing",
      verifyAccessToken
    );

    expect(result).toBeUndefined();
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("returns undefined when user row is missing", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    mockTenantFindFirst.mockResolvedValue({
      id: "t1",
      slug: "acme",
      schemaName: "tenant_acme",
    });
    mockUserFindUnique.mockResolvedValue(null);

    const result = await resolveMcpTenantContextFromWorkspaceSlug(
      createReq({ authorization: "Bearer tok" }),
      "acme",
      verifyAccessToken
    );

    expect(result).toBeUndefined();
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
  });

  it("resolves via membership when present", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    mockTenantFindFirst.mockResolvedValue({
      id: "t1",
      slug: "acme",
      schemaName: "tenant_acme",
    });
    mockUserFindUnique.mockResolvedValue({ role: UserRole.ADMIN });
    mockMembershipFindUnique.mockResolvedValue({
      role: "MEMBER",
      tenant: { id: "t1", slug: "acme", schemaName: "tenant_acme", status: "ACTIVE" },
    });

    const result = await resolveMcpTenantContextFromWorkspaceSlug(
      createReq({ authorization: "Bearer tok" }),
      "acme",
      verifyAccessToken
    );

    expect(result).toEqual({
      tenantId: "t1",
      tenantSlug: "acme",
      schemaName: "tenant_acme",
      membershipRole: "MEMBER",
    });
  });

  it("grants SUPER_ADMIN access without membership", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u-sa" }));
    mockTenantFindFirst.mockResolvedValue({
      id: "t1",
      slug: "acme",
      schemaName: "tenant_acme",
    });
    mockUserFindUnique.mockResolvedValue({ role: UserRole.SUPER_ADMIN });
    mockMembershipFindUnique.mockResolvedValue(null);

    const result = await resolveMcpTenantContextFromWorkspaceSlug(
      createReq({ authorization: "Bearer tok" }),
      "acme",
      verifyAccessToken
    );

    expect(result).toEqual({
      tenantId: "t1",
      tenantSlug: "acme",
      schemaName: "tenant_acme",
      membershipRole: "OWNER",
    });
  });

  it("returns undefined for non-member non-super-admin", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    mockTenantFindFirst.mockResolvedValue({
      id: "t1",
      slug: "acme",
      schemaName: "tenant_acme",
    });
    mockUserFindUnique.mockResolvedValue({ role: UserRole.ADMIN });
    mockMembershipFindUnique.mockResolvedValue(null);

    const result = await resolveMcpTenantContextFromWorkspaceSlug(
      createReq({ authorization: "Bearer tok" }),
      "acme",
      verifyAccessToken
    );

    expect(result).toBeUndefined();
  });
});
