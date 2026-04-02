import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";
import { tenantsRouter } from "./tenants.js";

vi.mock("../db.js", () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tenantRequest: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "../db.js";

const mockTenant = prisma.tenant as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
const mockTenantRequest = prisma.tenantRequest as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
};

function authSuperAdmin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: "sa1",
      email: "sa@test.local",
      name: "SA",
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      activeTenantId: null,
    } as Express.User;
    next();
  };
}

describe("system tenant (Tymio hub) guards", () => {
  const app = express();
  app.use(express.json());
  app.use(authSuperAdmin());
  app.use("/api/tenants", tenantsRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PATCH rejects suspending system workspace", async () => {
    mockTenant.findUnique.mockResolvedValue({
      id: "sys",
      slug: "tymio",
      name: "Tymio",
      schemaName: "tenant_tymio",
      status: "ACTIVE",
      isSystem: true,
    });

    const res = await request(app).patch("/api/tenants/sys").send({ status: "SUSPENDED" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("cannot be suspended");
    expect(mockTenant.update).not.toHaveBeenCalled();
  });

  it("PATCH rejects changing system workspace slug", async () => {
    mockTenant.findUnique.mockResolvedValue({
      id: "sys",
      slug: "tymio",
      name: "Tymio",
      schemaName: "tenant_tymio",
      status: "ACTIVE",
      isSystem: true,
    });

    const res = await request(app).patch("/api/tenants/sys").send({ slug: "other" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("slug");
    expect(mockTenant.update).not.toHaveBeenCalled();
  });

  it("DELETE returns 400 for system workspace", async () => {
    mockTenant.findUnique.mockResolvedValue({
      id: "sys",
      slug: "tymio",
      isSystem: true,
    });

    const res = await request(app).delete("/api/tenants/sys");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("cannot be deleted");
    expect(mockTenant.delete).not.toHaveBeenCalled();
  });

  it("DELETE removes non-system tenant", async () => {
    mockTenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "acme",
      isSystem: false,
    });
    mockTenantRequest.findFirst.mockResolvedValue(null);
    mockTenant.delete.mockResolvedValue({});

    const res = await request(app).delete("/api/tenants/t1");

    expect(res.status).toBe(204);
    expect(mockTenantRequest.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "t1" },
      select: { id: true, slug: true },
    });
    expect(mockTenant.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
  });

  it("DELETE returns 400 when a registration request is still linked to the tenant", async () => {
    mockTenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "acme",
      isSystem: false,
    });
    mockTenantRequest.findFirst.mockResolvedValue({ id: "tr1", slug: "acme" });

    const res = await request(app).delete("/api/tenants/t1");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("registration request");
    expect(mockTenant.delete).not.toHaveBeenCalled();
  });
});
