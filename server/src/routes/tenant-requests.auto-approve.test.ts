import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";

const autoApproveEnv = vi.hoisted(() => ({
  AUTO_APPROVE_WORKSPACE_REQUESTS: true,
  CLIENT_URL: "https://app.test",
}));

const { mockProvisionTenant, mockApplyWorkspaceInviteSideEffects, mockMail, mockRecipients } = vi.hoisted(
  () => ({
    mockProvisionTenant: vi.fn(),
    mockApplyWorkspaceInviteSideEffects: vi.fn().mockResolvedValue(undefined),
    mockMail: {
      isEnabled: vi.fn(() => false),
      isReady: vi.fn(() => false),
      log: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
    },
    mockRecipients: {
      getOrdered: vi.fn().mockResolvedValue([]),
      layout: vi.fn().mockReturnValue(null),
    },
  })
);

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
  isTransactionalEmailEnabled: (...args: unknown[]) => mockMail.isEnabled(...args),
  isTransactionalEmailReady: (...args: unknown[]) => mockMail.isReady(...args),
  logTransactionalEmail: (...args: unknown[]) => mockMail.log(...args),
  sendTransactionalEmail: (...args: unknown[]) => mockMail.send(...args),
}));

vi.mock("../services/transactionalRecipients.js", () => ({
  getSuperAdminEmailsOrdered: (...args: unknown[]) => mockRecipients.getOrdered(...args),
  layoutE1Recipients: (...args: unknown[]) => mockRecipients.layout(...args),
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
  prismaUnscoped: {
    workspaceAccessRequest: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
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
    mockMail.isEnabled.mockReturnValue(false);
    mockMail.isReady.mockReturnValue(false);
    mockRecipients.getOrdered.mockResolvedValue([]);
    mockRecipients.layout.mockReturnValue(null);
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

  it("sends E1 to super-admins with auto_approved outcome when mail is ready", async () => {
    mockMail.isEnabled.mockReturnValue(true);
    mockMail.isReady.mockReturnValue(true);
    mockRecipients.getOrdered.mockResolvedValue(["s@strt.vc", "ops@example.com"]);
    mockRecipients.layout.mockReturnValue({ to: "s@strt.vc", cc: ["ops@example.com"] });

    const createdRequest = {
      id: "tr-auto-mail",
      status: "PENDING",
      teamName: "Mail Co",
      slug: "mail-co",
      contactEmail: "owner@mail.com",
      contactName: "Owner",
      message: null,
      preferredLocale: "en",
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
        id: "ten-mail",
        name: "Mail Co",
        slug: "mail-co",
        status: "ACTIVE",
      });
    mockTenantRequest.findUnique.mockResolvedValue(null);
    mockTenantRequest.create.mockResolvedValue(createdRequest);
    mockTenant.create.mockResolvedValue({
      id: "ten-mail",
      name: "Mail Co",
      slug: "mail-co",
      status: "PROVISIONING",
    });
    mockUser.findUnique.mockResolvedValue({
      id: "u-mail",
      email: "owner@mail.com",
      name: "Owner",
      role: UserRole.PENDING,
      activeTenantId: null,
    });
    mockUser.update.mockResolvedValue({
      id: "u-mail",
      email: "owner@mail.com",
      role: UserRole.ADMIN,
      activeTenantId: "ten-mail",
    });
    mockTenantMembership.upsert.mockResolvedValue({});
    mockTenantRequest.update.mockResolvedValue({
      ...createdRequest,
      status: "APPROVED",
      tenantId: "ten-mail",
      reviewedBy: null,
      reviewNote: "auto-approved",
    });

    const res = await request(app).post("/api/tenant-requests").send({
      teamName: "Mail Co",
      slug: "mail-co",
      contactEmail: "owner@mail.com",
      contactName: "Owner",
      locale: "en",
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("APPROVED");
    expect(res.body.emailNotifications?.autoApproved).toBe(true);
    expect(res.body.emailNotifications?.adminsNotifiedOnSubmit).toBe(true);
    const e1Call = mockMail.send.mock.calls.find(
      (c: unknown[]) =>
        Array.isArray((c[0] as { tags?: { name: string; value: string }[] }).tags) &&
        (c[0] as { tags: { name: string; value: string }[] }).tags.some(
          (t) => t.name === "event" && t.value === "E1"
        )
    );
    expect(e1Call).toBeDefined();
    expect(e1Call![0]).toEqual(
      expect.objectContaining({
        to: "s@strt.vc",
        cc: ["ops@example.com"],
        subject: expect.stringContaining("New workspace created"),
        tags: expect.arrayContaining([
          { name: "event", value: "E1" },
          { name: "outcome", value: "auto_approved" },
        ]),
      })
    );
    expect((e1Call![0] as { text: string }).text).toContain("auto-approved");
    expect((e1Call![0] as { html: string }).html).toContain("/t/mail-co");
  });
});
