import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";

const autoApproveEnv = vi.hoisted(() => ({
  AUTO_APPROVE_WORKSPACE_REQUESTS: true,
}));

const { mockProvisionTenant, mockApplyWorkspaceInviteSideEffects } = vi.hoisted(() => ({
  mockProvisionTenant: vi.fn(),
  mockApplyWorkspaceInviteSideEffects: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../env.js", () => ({
  env: autoApproveEnv,
}));

vi.mock("../tenant/tenantProvisioning.js", () => ({
  provisionTenant: mockProvisionTenant,
}));

vi.mock("../lib/workspaceInviteSideEffects.js", () => ({
  applyWorkspaceInviteSideEffects: mockApplyWorkspaceInviteSideEffects,
}));

vi.mock("../services/transactionalMail.js", () => ({
  isTransactionalEmailEnabled: () => false,
  isTransactionalEmailReady: () => false,
  logTransactionalEmail: vi.fn(),
  sendTransactionalEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/transactionalRecipients.js", () => ({
  getSuperAdminEmailsOrdered: vi.fn().mockResolvedValue([]),
  layoutE1Recipients: vi.fn().mockReturnValue(null),
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
      create: vi.fn(),
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

import { tenantRequestsRouter } from "./tenant-requests.js";
import { prisma } from "../db.js";

const mockTenantRequest = prisma.tenantRequest as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
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

describe("POST /api/tenant-requests AUTO_APPROVE_WORKSPACE_REQUESTS", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/tenant-requests", tenantRequestsRouter);

  beforeEach(() => {
    vi.clearAllMocks();
    autoApproveEnv.AUTO_APPROVE_WORKSPACE_REQUESTS = true;
    mockProvisionTenant.mockResolvedValue(undefined);
    mockApplyWorkspaceInviteSideEffects.mockResolvedValue(undefined);
    mockPrismaTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
    mockTenantDomain.findUnique.mockResolvedValue(null);
    mockUserEmail.findUnique.mockResolvedValue(null);
    mockUser.create.mockImplementation(async (args: { data: { email: string } }) => ({
      id: "new-user",
      email: args.data.email,
    }));
    mockTenantMembership.create.mockResolvedValue({});
  });

  it("returns 201 with APPROVED, tenant, and autoApproved when auto-approve succeeds", async () => {
    const createdRequest = {
      id: "tr-auto-1",
      status: "PENDING",
      teamName: "Auto Co",
      slug: "auto-co",
      contactEmail: "owner@auto.com",
      contactName: "Owner",
      message: null,
      preferredLocale: null,
      inviteEmails: null,
      trustCompanyDomain: false,
      trustedEmailDomain: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      tenantId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockTenant.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "ten-auto",
        name: "Auto Co",
        slug: "auto-co",
        status: "ACTIVE",
      });
    mockTenantRequest.findUnique.mockResolvedValue(null);
    mockTenantRequest.create.mockResolvedValue(createdRequest);
    mockTenant.create.mockResolvedValue({
      id: "ten-auto",
      name: "Auto Co",
      slug: "auto-co",
      status: "PROVISIONING",
    });
    mockUser.findUnique.mockResolvedValue({
      id: "u-auto",
      email: "owner@auto.com",
      name: "Owner",
      role: UserRole.PENDING,
      activeTenantId: null,
    });
    mockUser.update.mockResolvedValue({
      id: "u-auto",
      email: "owner@auto.com",
      role: UserRole.ADMIN,
      activeTenantId: "ten-auto",
    });
    mockTenantMembership.upsert.mockResolvedValue({});
    mockTenantRequest.update.mockResolvedValue({
      ...createdRequest,
      status: "APPROVED",
      tenantId: "ten-auto",
      reviewedBy: null,
      reviewNote: "auto-approved",
    });

    const res = await request(app).post("/api/tenant-requests").send({
      teamName: "Auto Co",
      slug: "auto-co",
      contactEmail: "owner@auto.com",
      contactName: "Owner",
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("APPROVED");
    expect(res.body.tenant?.slug).toBe("auto-co");
    expect(res.body.emailNotifications?.autoApproved).toBe(true);
    expect(mockTenantRequest.create).toHaveBeenCalled();
    expect(mockProvisionTenant).toHaveBeenCalledWith("ten-auto");
    expect(mockTenantRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tr-auto-1" },
        data: expect.objectContaining({
          status: "APPROVED",
          reviewNote: "auto-approved",
          tenantId: "ten-auto",
        }),
      })
    );
  });

  it("returns 201 PENDING with autoApproveFailed when auto-approve throws after create", async () => {
    const createdRequest = {
      id: "tr-fail-1",
      status: "PENDING",
      teamName: "Fail Co",
      slug: "fail-co",
      contactEmail: "f@fail.com",
      contactName: "F",
      message: null,
      preferredLocale: null,
      inviteEmails: null,
      trustCompanyDomain: false,
      trustedEmailDomain: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      tenantId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockTenant.findUnique.mockResolvedValue(null);
    mockTenantRequest.findUnique.mockResolvedValue(null);
    mockTenantRequest.create.mockResolvedValue(createdRequest);
    mockTenant.create.mockResolvedValue({
      id: "ten-fail",
      name: "Fail Co",
      slug: "fail-co",
      status: "PROVISIONING",
    });
    mockProvisionTenant.mockRejectedValueOnce(new Error("provision boom"));

    const res = await request(app).post("/api/tenant-requests").send({
      teamName: "Fail Co",
      slug: "fail-co",
      contactEmail: "f@fail.com",
      contactName: "F",
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.id).toBe("tr-fail-1");
    expect(res.body.emailNotifications?.autoApproveFailed).toBe(true);
  });

  it("returns 201 PENDING without auto-approve when env flag is off", async () => {
    autoApproveEnv.AUTO_APPROVE_WORKSPACE_REQUESTS = false;

    const createdRequest = {
      id: "tr-manual-1",
      status: "PENDING",
      teamName: "Manual Co",
      slug: "manual-co",
      contactEmail: "m@manual.com",
      contactName: "M",
      message: null,
      preferredLocale: null,
      inviteEmails: null,
      trustCompanyDomain: false,
      trustedEmailDomain: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      tenantId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockTenant.findUnique.mockResolvedValue(null);
    mockTenantRequest.findUnique.mockResolvedValue(null);
    mockTenantRequest.create.mockResolvedValue(createdRequest);

    const res = await request(app).post("/api/tenant-requests").send({
      teamName: "Manual Co",
      slug: "manual-co",
      contactEmail: "m@manual.com",
      contactName: "M",
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.tenant).toBeUndefined();
    expect(mockProvisionTenant).not.toHaveBeenCalled();
    expect(res.body.emailNotifications?.autoApproveFailed).toBeUndefined();
  });
});
