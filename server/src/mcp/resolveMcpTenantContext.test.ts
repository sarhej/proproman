import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { resolveMcpTenantContext } from "./resolveMcpTenantContext.js";

function authInfo(extra: AuthInfo["extra"]): AuthInfo {
  return {
    token: "t",
    clientId: "c",
    scopes: [],
    extra,
  } as AuthInfo;
}

function createReq(headers: Record<string, string | string[] | undefined>): Pick<Request, "headers"> {
  return { headers } as Pick<Request, "headers">;
}

describe("resolveMcpTenantContext", () => {
  const verifyAccessToken = vi.fn();
  const userFindUnique = vi.fn();
  const tenantMembershipFindUnique = vi.fn();

  const prisma = {
    user: { findUnique: userFindUnique },
    tenantMembership: { findUnique: tenantMembershipFindUnique },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined when Authorization is missing", async () => {
    const result = await resolveMcpTenantContext(createReq({}), verifyAccessToken, prisma as never);
    expect(result).toBeUndefined();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("returns undefined when Bearer token is empty after strip", async () => {
    const result = await resolveMcpTenantContext(
      createReq({ authorization: "Bearer   " }),
      verifyAccessToken,
      prisma as never
    );
    expect(result).toBeUndefined();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("accepts lowercase bearer prefix", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    userFindUnique.mockResolvedValue({ activeTenantId: "t1" });
    tenantMembershipFindUnique.mockResolvedValue({
      role: "MEMBER",
      tenant: { id: "t1", slug: "acme", schemaName: "tenant_acme", status: "ACTIVE" },
    });

    const result = await resolveMcpTenantContext(
      createReq({ authorization: "bearer valid.jwt" }),
      verifyAccessToken,
      prisma as never
    );

    expect(verifyAccessToken).toHaveBeenCalledWith("valid.jwt");
    expect(result?.tenantId).toBe("t1");
  });

  it("returns undefined when JWT extra has no string userId", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: 123 as unknown as string }));
    const result = await resolveMcpTenantContext(
      createReq({ authorization: "Bearer tok" }),
      verifyAccessToken,
      prisma as never
    );
    expect(result).toBeUndefined();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("returns undefined when userId is missing from extra", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({}));
    const result = await resolveMcpTenantContext(
      createReq({ authorization: "Bearer tok" }),
      verifyAccessToken,
      prisma as never
    );
    expect(result).toBeUndefined();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("returns undefined when no X-Tenant-Id and user has no activeTenantId", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    userFindUnique.mockResolvedValue({ activeTenantId: null });
    const result = await resolveMcpTenantContext(
      createReq({ authorization: "Bearer tok" }),
      verifyAccessToken,
      prisma as never
    );
    expect(result).toBeUndefined();
    expect(tenantMembershipFindUnique).not.toHaveBeenCalled();
  });

  it("uses activeTenantId when header absent", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    userFindUnique.mockResolvedValue({ activeTenantId: "t-active" });
    tenantMembershipFindUnique.mockResolvedValue({
      role: "OWNER",
      tenant: { id: "t-active", slug: "hub", schemaName: "tenant_hub", status: "ACTIVE" },
    });

    const result = await resolveMcpTenantContext(
      createReq({ authorization: "Bearer tok" }),
      verifyAccessToken,
      prisma as never
    );

    expect(tenantMembershipFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_userId: { tenantId: "t-active", userId: "u1" } },
      })
    );
    expect(result).toEqual({
      tenantId: "t-active",
      tenantSlug: "hub",
      schemaName: "tenant_hub",
      membershipRole: "OWNER",
    });
  });

  it("X-Tenant-Id overrides activeTenantId", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    userFindUnique.mockResolvedValue({ activeTenantId: "t-wrong" });
    tenantMembershipFindUnique.mockResolvedValue({
      role: "ADMIN",
      tenant: { id: "t-header", slug: "other", schemaName: "tenant_other", status: "ACTIVE" },
    });

    const result = await resolveMcpTenantContext(
      createReq({
        authorization: "Bearer tok",
        "x-tenant-id": "t-header",
      }),
      verifyAccessToken,
      prisma as never
    );

    expect(tenantMembershipFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_userId: { tenantId: "t-header", userId: "u1" } },
      })
    );
    expect(result?.tenantId).toBe("t-header");
  });

  it("ignores whitespace-only X-Tenant-Id and falls back to activeTenantId", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    userFindUnique.mockResolvedValue({ activeTenantId: "t-fallback" });
    tenantMembershipFindUnique.mockResolvedValue({
      role: "MEMBER",
      tenant: { id: "t-fallback", slug: "fb", schemaName: "tenant_fb", status: "ACTIVE" },
    });

    const result = await resolveMcpTenantContext(
      createReq({
        authorization: "Bearer tok",
        "x-tenant-id": "   ",
      }),
      verifyAccessToken,
      prisma as never
    );

    expect(tenantMembershipFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_userId: { tenantId: "t-fallback", userId: "u1" } },
      })
    );
    expect(result?.tenantId).toBe("t-fallback");
  });

  it("ignores array X-Tenant-Id (uses activeTenantId)", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    userFindUnique.mockResolvedValue({ activeTenantId: "t-from-user" });
    tenantMembershipFindUnique.mockResolvedValue({
      role: "MEMBER",
      tenant: { id: "t-from-user", slug: "u", schemaName: "tenant_u", status: "ACTIVE" },
    });

    const result = await resolveMcpTenantContext(
      createReq({
        authorization: "Bearer tok",
        "x-tenant-id": ["t-a", "t-b"],
      }),
      verifyAccessToken,
      prisma as never
    );

    expect(tenantMembershipFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_userId: { tenantId: "t-from-user", userId: "u1" } },
      })
    );
    expect(result?.tenantId).toBe("t-from-user");
  });

  it("returns undefined when membership missing", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    userFindUnique.mockResolvedValue({ activeTenantId: "t-orphan" });
    tenantMembershipFindUnique.mockResolvedValue(null);

    const result = await resolveMcpTenantContext(
      createReq({ authorization: "Bearer tok" }),
      verifyAccessToken,
      prisma as never
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined when tenant is not ACTIVE", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    userFindUnique.mockResolvedValue({ activeTenantId: "t1" });
    tenantMembershipFindUnique.mockResolvedValue({
      role: "ADMIN",
      tenant: { id: "t1", slug: "s", schemaName: "tenant_s", status: "SUSPENDED" },
    });

    const result = await resolveMcpTenantContext(
      createReq({ authorization: "Bearer tok" }),
      verifyAccessToken,
      prisma as never
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined for PROVISIONING tenant", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    userFindUnique.mockResolvedValue({ activeTenantId: "t1" });
    tenantMembershipFindUnique.mockResolvedValue({
      role: "ADMIN",
      tenant: { id: "t1", slug: "p", schemaName: "tenant_p", status: "PROVISIONING" },
    });

    const result = await resolveMcpTenantContext(
      createReq({ authorization: "Bearer tok" }),
      verifyAccessToken,
      prisma as never
    );
    expect(result).toBeUndefined();
  });

  it("resolves with X-Tenant-Id when user row missing but membership exists", async () => {
    verifyAccessToken.mockResolvedValue(authInfo({ userId: "u1" }));
    userFindUnique.mockResolvedValue(null);
    tenantMembershipFindUnique.mockResolvedValue({
      role: "MEMBER",
      tenant: { id: "t-x", slug: "x", schemaName: "tenant_x", status: "ACTIVE" },
    });

    const result = await resolveMcpTenantContext(
      createReq({
        authorization: "Bearer tok",
        "x-tenant-id": "t-x",
      }),
      verifyAccessToken,
      prisma as never
    );

    expect(result?.tenantId).toBe("t-x");
  });

  it("propagates verifyAccessToken errors", async () => {
    verifyAccessToken.mockRejectedValue(new Error("invalid jwt"));
    await expect(
      resolveMcpTenantContext(createReq({ authorization: "Bearer bad" }), verifyAccessToken, prisma as never)
    ).rejects.toThrow("invalid jwt");
  });
});
