import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { MembershipRole, UserRole } from "@prisma/client";

const { mockFindUnique, mockUpdate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("../db.js", () => ({
  prisma: {},
  prismaUnscoped: {
    tenant: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}));

function authAs(role: UserRole, userId = "u1") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: userId,
      email: `${userId}@test.local`,
      name: "Test",
      role,
      isActive: true,
      activeTenantId: "t1",
    } as Express.User;
    next();
  };
}

function withTenantContext(membershipRole: MembershipRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { tenantContext: object }).tenantContext = {
      tenantId: "t1",
      tenantSlug: "acme",
      schemaName: "t_acme",
      membershipRole,
    };
    next();
  };
}

describe("PATCH /api/me/active-tenant/languages", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue({ settings: { other: true } });
    mockUpdate.mockResolvedValue({});

    const mod = await import("./me.js");
    app = express();
    app.use(express.json());
    app.use(authAs(UserRole.EDITOR));
    app.use(withTenantContext(MembershipRole.OWNER));
    app.use("/api/me", mod.meRouter);
  });

  it("returns 400 without tenant context", async () => {
    const mod = await import("./me.js");
    const bare = express();
    bare.use(express.json());
    bare.use(authAs(UserRole.EDITOR));
    bare.use("/api/me", mod.meRouter);

    const res = await request(bare)
      .patch("/api/me/active-tenant/languages")
      .send({ enabledLocales: ["en"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Workspace context required/i);
  });

  it("returns 403 for MEMBER workspace role", async () => {
    const mod = await import("./me.js");
    const appMember = express();
    appMember.use(express.json());
    appMember.use(authAs(UserRole.EDITOR));
    appMember.use(withTenantContext(MembershipRole.MEMBER));
    appMember.use("/api/me", mod.meRouter);

    const res = await request(appMember)
      .patch("/api/me/active-tenant/languages")
      .send({ enabledLocales: ["en", "pl"] });

    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid locale codes", async () => {
    const res = await request(app)
      .patch("/api/me/active-tenant/languages")
      .send({ enabledLocales: ["en", "xx"] });

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("merges settings and returns normalized list for OWNER", async () => {
    const res = await request(app)
      .patch("/api/me/active-tenant/languages")
      .send({ enabledLocales: ["pl", "en"] });

    expect(res.status).toBe(200);
    expect(res.body.enabledLocales).toEqual(["pl", "en"]);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "t1" },
      select: { settings: true },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { settings: { other: true, enabledLocales: ["pl", "en"] } },
    });
  });

  it("allows SUPER_ADMIN even when membership role is VIEWER", async () => {
    const mod = await import("./me.js");
    const appSa = express();
    appSa.use(express.json());
    appSa.use(authAs(UserRole.SUPER_ADMIN));
    appSa.use(withTenantContext(MembershipRole.VIEWER));
    appSa.use("/api/me", mod.meRouter);

    const res = await request(appSa)
      .patch("/api/me/active-tenant/languages")
      .send({ enabledLocales: ["en"] });

    expect(res.status).toBe(200);
    expect(res.body.enabledLocales).toEqual(["en"]);
  });
});
