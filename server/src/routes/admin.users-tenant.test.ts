import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";
import { adminRouter } from "./admin.js";

vi.mock("../db.js", () => ({
  prisma: {
    tenantMembership: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn()
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn()
    },
    userEmail: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn()
    }
  }
}));

vi.mock("../services/audit.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}));

import { prisma } from "../db.js";

const mockTm = prisma.tenantMembership as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const mockUser = prisma.user as unknown as {
  update: ReturnType<typeof vi.fn>;
};

function authAdmin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: "admin1",
      email: "a@test.local",
      name: "A",
      role: UserRole.ADMIN,
      isActive: true,
      activeTenantId: "t1"
    } as Express.User;
    next();
  };
}

function withTenant(tenantId: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { tenantContext: { tenantId: string } }).tenantContext = { tenantId };
    next();
  };
}

describe("admin /users workspace isolation", () => {
  const appNoTenant = express();
  appNoTenant.use(express.json());
  appNoTenant.use(authAdmin());
  appNoTenant.use("/api/admin", adminRouter);

  const appWithTenant = express();
  appWithTenant.use(express.json());
  appWithTenant.use(authAdmin());
  appWithTenant.use(withTenant("t-tymio"));
  appWithTenant.use("/api/admin", adminRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /users returns 400 without workspace context", async () => {
    const res = await request(appNoTenant).get("/api/admin/users");
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("Workspace context");
    expect(mockTm.findMany).not.toHaveBeenCalled();
  });

  it("GET /users lists only members of active workspace", async () => {
    const u1 = {
      id: "u1",
      email: "a@x.com",
      name: "A",
      role: UserRole.ADMIN,
      isActive: true,
      emails: []
    };
    mockTm.findMany.mockResolvedValue([{ user: u1, createdAt: new Date() }]);

    const res = await request(appWithTenant).get("/api/admin/users");

    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([u1]);
    expect(mockTm.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t-tymio" }
      })
    );
  });

  it("PUT /users/:id returns 403 when target has no membership in workspace", async () => {
    mockTm.findUnique.mockResolvedValue(null);

    const res = await request(appWithTenant).put("/api/admin/users/u-peter").send({ name: "Peter" });

    expect(res.status).toBe(403);
    expect(mockUser.update).not.toHaveBeenCalled();
  });
});
