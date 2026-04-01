import { describe, it, expect, vi, beforeEach } from "vitest";
import { tenantResolver } from "./tenantResolver.js";
import { getTenantContext } from "./tenantContext.js";
import { prisma } from "../db.js";
import type { Request, Response, NextFunction } from "express";

vi.mock("../db.js", () => ({
  prisma: {
    tenantMembership: { findUnique: vi.fn() },
  },
}));

const mockPrisma = prisma as unknown as {
  tenantMembership: { findUnique: ReturnType<typeof vi.fn> };
};

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    user: undefined,
    headers: {},
    session: {} as Request["session"],
    tenantContext: undefined,
    ...overrides,
  } as unknown as Request;
}

function createRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("tenantResolver middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls next without tenant context when no user", async () => {
    const req = createReq({ user: undefined });
    const res = createRes();
    const next = vi.fn();

    await tenantResolver(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantContext).toBeUndefined();
  });

  it("resolves tenant from X-Tenant-Id header", async () => {
    const req = createReq({
      user: { id: "u1", activeTenantId: null } as Express.User,
      headers: { "x-tenant-id": "t-header" },
    });
    const res = createRes();
    const next = vi.fn();

    mockPrisma.tenantMembership.findUnique.mockResolvedValue({
      role: "ADMIN",
      tenant: { id: "t-header", slug: "acme", schemaName: "tenant_acme", status: "ACTIVE" },
    });

    await tenantResolver(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantContext).toBeDefined();
    expect(req.tenantContext!.tenantId).toBe("t-header");
    expect(req.tenantContext!.membershipRole).toBe("ADMIN");
  });

  it("resolves tenant from session.activeTenantId when no header", async () => {
    const req = createReq({
      user: { id: "u1", activeTenantId: null } as Express.User,
      session: { activeTenantId: "t-session" } as Request["session"],
    });
    const res = createRes();
    const next = vi.fn();

    mockPrisma.tenantMembership.findUnique.mockResolvedValue({
      role: "MEMBER",
      tenant: { id: "t-session", slug: "beta", schemaName: "tenant_beta", status: "ACTIVE" },
    });

    await tenantResolver(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantContext!.tenantId).toBe("t-session");
  });

  it("resolves tenant from user.activeTenantId as fallback", async () => {
    const req = createReq({
      user: { id: "u1", activeTenantId: "t-user" } as Express.User,
    });
    const res = createRes();
    const next = vi.fn();

    mockPrisma.tenantMembership.findUnique.mockResolvedValue({
      role: "OWNER",
      tenant: { id: "t-user", slug: "gamma", schemaName: "tenant_gamma", status: "ACTIVE" },
    });

    await tenantResolver(req, res, next);

    expect(req.tenantContext!.tenantId).toBe("t-user");
    expect(req.tenantContext!.membershipRole).toBe("OWNER");
  });

  it("ignores whitespace-only X-Tenant-Id and uses session", async () => {
    const req = createReq({
      user: { id: "u1", activeTenantId: null } as Express.User,
      headers: { "x-tenant-id": "   " },
      session: { activeTenantId: "t-session" } as Request["session"],
    });
    const res = createRes();
    const next = vi.fn();

    mockPrisma.tenantMembership.findUnique.mockResolvedValue({
      role: "MEMBER",
      tenant: { id: "t-session", slug: "sess", schemaName: "tenant_sess", status: "ACTIVE" },
    });

    await tenantResolver(req, res, next);

    expect(req.tenantContext!.tenantId).toBe("t-session");
    expect(mockPrisma.tenantMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_userId: { tenantId: "t-session", userId: "u1" } },
      })
    );
  });

  it("ignores array X-Tenant-Id and uses user.activeTenantId", async () => {
    const req = createReq({
      user: { id: "u1", activeTenantId: "t-user" } as Express.User,
      headers: { "x-tenant-id": ["a", "b"] },
    });
    const res = createRes();
    const next = vi.fn();

    mockPrisma.tenantMembership.findUnique.mockResolvedValue({
      role: "MEMBER",
      tenant: { id: "t-user", slug: "u", schemaName: "tenant_u", status: "ACTIVE" },
    });

    await tenantResolver(req, res, next);

    expect(req.tenantContext!.tenantId).toBe("t-user");
  });

  it("header takes priority over session and user", async () => {
    const req = createReq({
      user: { id: "u1", activeTenantId: "t-user" } as Express.User,
      headers: { "x-tenant-id": "t-header" },
      session: { activeTenantId: "t-session" } as Request["session"],
    });
    const res = createRes();
    const next = vi.fn();

    mockPrisma.tenantMembership.findUnique.mockResolvedValue({
      role: "ADMIN",
      tenant: { id: "t-header", slug: "priority", schemaName: "tenant_priority", status: "ACTIVE" },
    });

    await tenantResolver(req, res, next);

    expect(req.tenantContext!.tenantId).toBe("t-header");
    expect(mockPrisma.tenantMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_userId: { tenantId: "t-header", userId: "u1" } },
      })
    );
  });

  it("passes through without context when no tenantId is available", async () => {
    const req = createReq({
      user: { id: "u1", activeTenantId: null } as Express.User,
    });
    const res = createRes();
    const next = vi.fn();

    await tenantResolver(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantContext).toBeUndefined();
    expect(mockPrisma.tenantMembership.findUnique).not.toHaveBeenCalled();
  });

  it("passes through without context when membership not found", async () => {
    const req = createReq({
      user: { id: "u1", activeTenantId: "t-orphan" } as Express.User,
    });
    const res = createRes();
    const next = vi.fn();

    mockPrisma.tenantMembership.findUnique.mockResolvedValue(null);

    await tenantResolver(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantContext).toBeUndefined();
  });

  it("passes through without context when tenant is SUSPENDED", async () => {
    const req = createReq({
      user: { id: "u1", activeTenantId: "t-sus" } as Express.User,
    });
    const res = createRes();
    const next = vi.fn();

    mockPrisma.tenantMembership.findUnique.mockResolvedValue({
      role: "ADMIN",
      tenant: { id: "t-sus", slug: "suspended", schemaName: "tenant_suspended", status: "SUSPENDED" },
    });

    await tenantResolver(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantContext).toBeUndefined();
  });

  it("passes through without context when tenant is PROVISIONING", async () => {
    const req = createReq({
      user: { id: "u1", activeTenantId: "t-prov" } as Express.User,
    });
    const res = createRes();
    const next = vi.fn();

    mockPrisma.tenantMembership.findUnique.mockResolvedValue({
      role: "ADMIN",
      tenant: { id: "t-prov", slug: "prov", schemaName: "tenant_prov", status: "PROVISIONING" },
    });

    await tenantResolver(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantContext).toBeUndefined();
  });

  it("calls next() even when DB lookup throws (graceful degradation)", async () => {
    const req = createReq({
      user: { id: "u1", activeTenantId: "t-err" } as Express.User,
    });
    const res = createRes();
    const next = vi.fn();

    mockPrisma.tenantMembership.findUnique.mockRejectedValue(new Error("DB down"));

    await tenantResolver(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantContext).toBeUndefined();
  });
});
