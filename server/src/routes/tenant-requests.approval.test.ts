import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";
import { tenantRequestsRouter } from "./tenant-requests.js";

const { mockProvisionTenant } = vi.hoisted(() => ({
  mockProvisionTenant: vi.fn(),
}));

vi.mock("../tenant/tenantProvisioning.js", () => ({
  provisionTenant: mockProvisionTenant,
}));

vi.mock("../db.js", () => ({
  prisma: {
    tenantRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tenant: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    tenantMembership: {
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "../db.js";

const mockTenantRequest = prisma.tenantRequest as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockTenant = prisma.tenant as unknown as {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
};
const mockUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockTenantMembership = prisma.tenantMembership as unknown as {
  upsert: ReturnType<typeof vi.fn>;
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

function authGlobalAdmin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: "ga1",
      email: "ga@test.local",
      name: "GA",
      role: UserRole.ADMIN,
      isActive: true,
      activeTenantId: null,
    } as Express.User;
    next();
  };
}

describe("tenant request approval", () => {
  const app = express();
  app.use(express.json());
  app.use(authSuperAdmin());
  app.use("/api/tenant-requests", tenantRequestsRouter);

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvisionTenant.mockResolvedValue(undefined);
  });

  it("promotes an existing pending requester to ADMIN and sets active tenant on approval", async () => {
    mockTenantRequest.findUnique.mockResolvedValueOnce({
      id: "tr1",
      status: "PENDING",
      teamName: "Peter Workspace",
      slug: "peter-workspace",
      contactEmail: "peter@pvegh.com",
      contactName: "Peter Vegh",
    });
    mockTenant.create.mockResolvedValue({
      id: "tenant1",
      name: "Peter Workspace",
      slug: "peter-workspace",
      status: "PROVISIONING",
    });
    mockTenant.findUnique.mockResolvedValue({
      id: "tenant1",
      name: "Peter Workspace",
      slug: "peter-workspace",
      status: "ACTIVE",
    });
    mockUser.findUnique.mockResolvedValue({
      id: "user1",
      email: "peter@pvegh.com",
      name: "Peter Vegh",
      role: UserRole.PENDING,
      activeTenantId: null,
    });
    mockUser.update.mockResolvedValue({
      id: "user1",
      email: "peter@pvegh.com",
      name: "Peter Vegh",
      role: UserRole.ADMIN,
      activeTenantId: "tenant1",
    });
    mockTenantMembership.upsert.mockResolvedValue({
      tenantId: "tenant1",
      userId: "user1",
      role: "OWNER",
    });
    mockTenantRequest.update.mockResolvedValue({
      id: "tr1",
      status: "APPROVED",
      tenantId: "tenant1",
    });

    const res = await request(app)
      .post("/api/tenant-requests/tr1/review")
      .send({ action: "approve" });

    expect(res.status).toBe(200);
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: {
        name: "Peter Vegh",
        role: UserRole.ADMIN,
        activeTenantId: "tenant1",
      },
    });
    expect(mockTenantMembership.upsert).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId: "tenant1", userId: "user1" } },
      create: { tenantId: "tenant1", userId: "user1", role: "OWNER" },
      update: { role: "OWNER" },
    });
  });

  it("returns 400 when approving a request that is already APPROVED", async () => {
    mockTenantRequest.findUnique.mockResolvedValueOnce({
      id: "tr-done",
      status: "APPROVED",
      teamName: "Old",
      slug: "old",
      contactEmail: "old@test.local",
      contactName: "Old",
    });

    const res = await request(app)
      .post("/api/tenant-requests/tr-done/review")
      .send({ action: "approve" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already approved");
    expect(mockTenant.create).not.toHaveBeenCalled();
  });

  it("returns 403 when global ADMIN (non-SUPER_ADMIN) tries to review", async () => {
    const adminApp = express();
    adminApp.use(express.json());
    adminApp.use(authGlobalAdmin());
    adminApp.use("/api/tenant-requests", tenantRequestsRouter);

    const res = await request(adminApp)
      .post("/api/tenant-requests/tr1/review")
      .send({ action: "approve" });

    expect(res.status).toBe(403);
    expect(mockTenantRequest.findUnique).not.toHaveBeenCalled();
  });
});
