import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";
import { tenantRequestsRouter } from "./tenant-requests.js";

const { mockProvisionTenant, mockApplyWorkspaceInviteSideEffects } = vi.hoisted(() => ({
  mockProvisionTenant: vi.fn(),
  mockApplyWorkspaceInviteSideEffects: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../tenant/tenantProvisioning.js", () => ({
  provisionTenant: mockProvisionTenant,
}));

vi.mock("../lib/workspaceInviteSideEffects.js", () => ({
  applyWorkspaceInviteSideEffects: mockApplyWorkspaceInviteSideEffects,
}));

vi.mock("../db.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    tenantDomain: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    userEmail: {
      findUnique: vi.fn(),
    },
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
      create: vi.fn(),
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
  create: ReturnType<typeof vi.fn>;
};
const mockPrismaTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const mockTenantDomain = prisma.tenantDomain as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};
const mockUserEmail = prisma.userEmail as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
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
    mockApplyWorkspaceInviteSideEffects.mockResolvedValue(undefined);
    mockPrismaTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
    mockTenantDomain.findUnique.mockResolvedValue(null);
    mockUserEmail.findUnique.mockResolvedValue(null);
    mockUser.create.mockImplementation(async (args: { data: { email: string } }) => ({
      id: "new-invite-user",
      email: args.data.email,
    }));
    mockTenantMembership.create.mockResolvedValue({});
  });

  it("promotes an existing pending requester to ADMIN and sets active tenant on approval", async () => {
    mockTenantRequest.findUnique.mockResolvedValueOnce({
      id: "tr1",
      status: "PENDING",
      teamName: "Peter Workspace",
      slug: "peter-workspace",
      contactEmail: "peter@pvegh.com",
      contactName: "Peter Vegh",
      inviteEmails: null,
      trustCompanyDomain: false,
      trustedEmailDomain: null,
      preferredLocale: null,
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

  it("does not mark APPROVED or set tenantId when provisionTenant fails after tenant create", async () => {
    mockTenantRequest.findUnique.mockResolvedValueOnce({
      id: "tr1",
      status: "PENDING",
      teamName: "Fail Co",
      slug: "fail-co",
      contactEmail: "fail@example.com",
      contactName: "Fail",
      inviteEmails: null,
      trustCompanyDomain: false,
      trustedEmailDomain: null,
      preferredLocale: null,
    });
    mockTenant.create.mockResolvedValue({
      id: "tenant-fail",
      name: "Fail Co",
      slug: "fail-co",
      status: "PROVISIONING",
    });
    mockProvisionTenant.mockRejectedValueOnce(new Error("provision failed"));

    const res = await request(app)
      .post("/api/tenant-requests/tr1/review")
      .send({ action: "approve" });

    expect(res.status).toBe(500);
    expect(mockTenantRequest.update).not.toHaveBeenCalled();
  });

  it("returns 400 when approving a request that is already APPROVED", async () => {
    mockTenantRequest.findUnique.mockResolvedValueOnce({
      id: "tr-done",
      status: "APPROVED",
      teamName: "Old",
      slug: "old",
      contactEmail: "old@test.local",
      contactName: "Old",
      inviteEmails: null,
      trustCompanyDomain: false,
      trustedEmailDomain: null,
      preferredLocale: null,
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

  it("creates TenantDomain and provisions invitee when request has trust + invite emails", async () => {
    mockTenantRequest.findUnique.mockResolvedValueOnce({
      id: "tr-inv",
      status: "PENDING",
      teamName: "Acme",
      slug: "acme-ws",
      contactEmail: "owner@acme.com",
      contactName: "Owner",
      inviteEmails: ["colleague@acme.com"],
      trustCompanyDomain: true,
      trustedEmailDomain: "acme.com",
      preferredLocale: null,
    });
    mockTenant.create.mockResolvedValue({
      id: "tenant-acme",
      name: "Acme",
      slug: "acme-ws",
      status: "PROVISIONING",
    });
    mockTenant.findUnique.mockResolvedValue({
      id: "tenant-acme",
      name: "Acme",
      slug: "acme-ws",
      status: "ACTIVE",
    });
    mockUser.findUnique.mockImplementation((args: { where: { email?: string } }) => {
      const em = args.where.email;
      if (em === "owner@acme.com") {
        return Promise.resolve({
          id: "owner-u",
          email: "owner@acme.com",
          name: "Owner",
          role: UserRole.PENDING,
          activeTenantId: null,
        });
      }
      return Promise.resolve(null);
    });
    mockUser.update.mockResolvedValue({
      id: "owner-u",
      email: "owner@acme.com",
      role: UserRole.ADMIN,
      activeTenantId: "tenant-acme",
    });
    mockUser.create.mockResolvedValue({
      id: "inv-u",
      email: "colleague@acme.com",
    });
    mockTenantMembership.upsert.mockResolvedValue({});
    mockTenantMembership.create.mockResolvedValue({});
    mockTenantRequest.update.mockResolvedValue({
      id: "tr-inv",
      status: "APPROVED",
      tenantId: "tenant-acme",
    });

    const res = await request(app).post("/api/tenant-requests/tr-inv/review").send({ action: "approve" });

    expect(res.status).toBe(200);
    expect(mockTenantDomain.create).toHaveBeenCalledWith({
      data: { tenantId: "tenant-acme", domain: "acme.com", isPrimary: true },
    });
    expect(mockTenantMembership.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-acme",
        userId: "inv-u",
        role: "MEMBER",
      },
    });
    expect(mockApplyWorkspaceInviteSideEffects).toHaveBeenCalledWith("inv-u", "tenant-acme");
  });

  it("skips TenantDomain create when domain is already bound to another tenant", async () => {
    mockTenantRequest.findUnique.mockResolvedValueOnce({
      id: "tr-dom",
      status: "PENDING",
      teamName: "Beta",
      slug: "beta-ws",
      contactEmail: "owner@shared.com",
      contactName: "Owner",
      inviteEmails: [],
      trustCompanyDomain: true,
      trustedEmailDomain: "shared.com",
      preferredLocale: null,
    });
    mockTenant.create.mockResolvedValue({
      id: "tenant-beta",
      name: "Beta",
      slug: "beta-ws",
      status: "PROVISIONING",
    });
    mockTenant.findUnique.mockResolvedValue({
      id: "tenant-beta",
      name: "Beta",
      slug: "beta-ws",
      status: "ACTIVE",
    });
    mockTenantDomain.findUnique.mockResolvedValue({
      tenantId: "someone-else-tenant",
      domain: "shared.com",
    });
    mockUser.findUnique.mockResolvedValue({
      id: "u-beta",
      email: "owner@shared.com",
      name: "Owner",
      role: UserRole.VIEWER,
      activeTenantId: null,
    });
    mockUser.update.mockResolvedValue({});
    mockTenantMembership.upsert.mockResolvedValue({});
    mockTenantRequest.update.mockResolvedValue({ id: "tr-dom", status: "APPROVED" });

    const res = await request(app).post("/api/tenant-requests/tr-dom/review").send({ action: "approve" });

    expect(res.status).toBe(200);
    expect(mockTenantDomain.create).not.toHaveBeenCalled();
  });
});
