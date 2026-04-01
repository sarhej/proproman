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
    },
  },
}));

import { prisma } from "../db.js";

const mockTenant = prisma.tenant as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
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

describe("PATCH /api/tenants/:id (slug)", () => {
  const app = express();
  app.use(express.json());
  app.use(authSuperAdmin());
  app.use("/api/tenants", tenantsRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates slug and schemaName when unique", async () => {
    mockTenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "acme",
      name: "Acme",
      schemaName: "tenant_acme",
      status: "ACTIVE",
    });
    mockTenant.findFirst.mockResolvedValue(null);
    mockTenant.update.mockResolvedValue({
      id: "t1",
      slug: "acme-new",
      name: "Acme",
      schemaName: "tenant_acme_new",
      status: "ACTIVE",
    });

    const res = await request(app).patch("/api/tenants/t1").send({ slug: "acme-new" });

    expect(res.status).toBe(200);
    expect(mockTenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { slug: "acme-new", schemaName: "tenant_acme_new" },
    });
  });

  it("returns 409 when slug conflicts with another tenant", async () => {
    mockTenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "acme",
      name: "Acme",
      schemaName: "tenant_acme",
      status: "ACTIVE",
    });
    mockTenant.findFirst.mockResolvedValue({ id: "t2" });

    const res = await request(app).patch("/api/tenants/t1").send({ slug: "taken" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already used");
    expect(mockTenant.update).not.toHaveBeenCalled();
  });

  it("returns 404 when tenant missing", async () => {
    mockTenant.findUnique.mockResolvedValue(null);

    const res = await request(app).patch("/api/tenants/missing").send({ slug: "ab" });

    expect(res.status).toBe(404);
    expect(mockTenant.update).not.toHaveBeenCalled();
  });

  it("no-ops update when slug unchanged", async () => {
    mockTenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "same",
      name: "N",
      schemaName: "tenant_same",
      status: "ACTIVE",
    });

    const res = await request(app).patch("/api/tenants/t1").send({ slug: "same" });

    expect(res.status).toBe(200);
    expect(mockTenant.update).not.toHaveBeenCalled();
  });

  it("patches name only without slug", async () => {
    mockTenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "acme",
      name: "Old",
      schemaName: "tenant_acme",
      status: "ACTIVE",
    });
    mockTenant.update.mockResolvedValue({
      id: "t1",
      slug: "acme",
      name: "New Name",
      schemaName: "tenant_acme",
      status: "ACTIVE",
    });

    const res = await request(app).patch("/api/tenants/t1").send({ name: "New Name" });

    expect(res.status).toBe(200);
    expect(mockTenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { name: "New Name" },
    });
  });

  it("returns existing tenant when body is empty object", async () => {
    const existing = {
      id: "t1",
      slug: "acme",
      name: "Acme",
      schemaName: "tenant_acme",
      status: "ACTIVE" as const,
    };
    mockTenant.findUnique.mockResolvedValue(existing);

    const res = await request(app).patch("/api/tenants/t1").send({});

    expect(res.status).toBe(200);
    expect(res.body.slug).toBe("acme");
    expect(mockTenant.update).not.toHaveBeenCalled();
  });

  it("rejects invalid slug with 4xx/5xx (Zod)", async () => {
    mockTenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "acme",
      name: "A",
      schemaName: "tenant_acme",
      status: "ACTIVE",
    });

    const res = await request(app).patch("/api/tenants/t1").send({ slug: "BAD_SLUG" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockTenant.update).not.toHaveBeenCalled();
  });

  it("rejects slug shorter than 2 characters", async () => {
    mockTenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "acme",
      name: "A",
      schemaName: "tenant_acme",
      status: "ACTIVE",
    });

    const res = await request(app).patch("/api/tenants/t1").send({ slug: "a" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockTenant.update).not.toHaveBeenCalled();
  });
});
