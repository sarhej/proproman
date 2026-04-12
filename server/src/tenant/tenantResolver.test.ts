import { describe, it, expect, vi, beforeEach } from "vitest";
import { tenantResolver } from "./tenantResolver.js";
import { getTenantContext } from "./tenantContext.js";
import { prisma } from "../db.js";
import type { Request, Response, NextFunction } from "express";

vi.mock("../db.js", () => ({
  prisma: {
    tenantMembership: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { update: vi.fn() },
  },
}));

const mockPrisma = prisma as unknown as {
  tenantMembership: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  user: { update: ReturnType<typeof vi.fn> };
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
    mockPrisma.tenantMembership.findMany.mockResolvedValue([]);
    mockPrisma.user.update.mockResolvedValue({} as never);
  });

  it("calls next without tenant context when no user", async () => {
    const req = createReq({ user: undefined });
    const res = createRes();
    const next = vi.fn();

    await tenantResolver(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantContext).toBeUndefined();
  });

  it("skips header/session resolution for canonical workspace-plane paths", async () => {
    const req = createReq({
      path: "/t/acme/api/meta",
      user: { id: "u1", activeTenantId: null } as Express.User,
      headers: { "x-tenant-id": "t-other" },
    });
    const res = createRes();
    const next = vi.fn();

    await tenantResolver(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantContext).toBeUndefined();
    expect(mockPrisma.tenantMembership.findUnique).not.toHaveBeenCalled();
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
    expect(mockPrisma.tenantMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
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

  it("falls back to user.activeTenantId when session points at a removed or invalid workspace", async () => {
    const session = { activeTenantId: "t-stale" } as Request["session"];
    const req = createReq({
      user: { id: "u1", activeTenantId: "t-user" } as Express.User,
      session,
    });
    const res = createRes();
    const next = vi.fn();

    mockPrisma.tenantMembership.findUnique.mockImplementation(
      async (args: { where: { tenantId_userId: { tenantId: string; userId: string } } }) => {
        const tid = args.where.tenantId_userId.tenantId;
        if (tid === "t-stale") return null;
        if (tid === "t-user") {
          return {
            role: "ADMIN" as const,
            tenant: {
              id: "t-user",
              slug: "gamma",
              schemaName: "tenant_gamma",
              status: "ACTIVE" as const,
            },
          };
        }
        return null;
      }
    );

    await tenantResolver(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantContext!.tenantId).toBe("t-user");
    expect(session.activeTenantId).toBe("t-user");
    expect(mockPrisma.tenantMembership.findUnique).toHaveBeenCalledTimes(2);
  });

  it("falls back when X-Tenant-Id is stale or invalid (e.g. tab sessionStorage)", async () => {
    const req = createReq({
      user: { id: "u1", activeTenantId: "t-user" } as Express.User,
      headers: { "x-tenant-id": "t-bad-header" },
      session: { activeTenantId: "t-session" } as Request["session"],
    });
    const res = createRes();
    const next = vi.fn();

    mockPrisma.tenantMembership.findUnique.mockImplementation(
      async (args: { where: { tenantId_userId: { tenantId: string; userId: string } } }) => {
        const tid = args.where.tenantId_userId.tenantId;
        if (tid === "t-bad-header") return null;
        if (tid === "t-session") {
          return {
            role: "MEMBER" as const,
            tenant: { id: "t-session", slug: "sess", schemaName: "tenant_sess", status: "ACTIVE" as const },
          };
        }
        return null;
      }
    );

    await tenantResolver(req, res, next);

    expect(req.tenantContext!.tenantId).toBe("t-session");
    expect(mockPrisma.tenantMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_userId: { tenantId: "t-bad-header", userId: "u1" } },
      })
    );
    expect(mockPrisma.tenantMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_userId: { tenantId: "t-session", userId: "u1" } },
      })
    );
  });

  it("uses first ACTIVE membership when session and User.activeTenantId are empty", async () => {
    const user = { id: "u1", activeTenantId: null } as Express.User;
    const req = createReq({ user });
    const res = createRes();
    const next = vi.fn();

    mockPrisma.tenantMembership.findMany.mockResolvedValue([
      {
        role: "ADMIN" as const,
        tenant: {
          id: "t-fp",
          slug: "futureplace",
          schemaName: "tenant_futureplace",
          status: "ACTIVE" as const,
        },
      },
    ]);

    await tenantResolver(req, res, next);

    expect(req.tenantContext!.tenantId).toBe("t-fp");
    expect(req.tenantContext!.tenantSlug).toBe("futureplace");
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { activeTenantId: "t-fp" },
    });
    expect(user.activeTenantId).toBe("t-fp");
  });
});
