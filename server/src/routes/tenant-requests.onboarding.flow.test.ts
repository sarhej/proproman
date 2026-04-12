/**
 * Automated "new tenant onboarding" narrative at the HTTP router layer (no real DB).
 * Covers: public submit → public status PENDING → SUPER_ADMIN approve → ACTIVE tenant + status APPROVED.
 *
 * For full provisioning against Postgres, run: npm run test:integration --workspace server
 * (see tenant-requests.integration.test.ts).
 */
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

vi.mock("../services/transactionalMail.js", () => ({
  isTransactionalEmailEnabled: vi.fn(() => false),
  isTransactionalEmailReady: vi.fn(() => false),
  sendTransactionalEmail: vi.fn(),
  logTransactionalEmail: vi.fn(),
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
      create: vi.fn(),
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
  create: ReturnType<typeof vi.fn>;
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

function authSuperAdmin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: "sa-onb",
      email: "sa-onb@test.local",
      name: "SA",
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      activeTenantId: null,
    } as Express.User;
    next();
  };
}

describe("new tenant onboarding (HTTP flow, mocked DB)", () => {
  const requestId = "tr-onboarding-flow-1";
  const slug = "onboarding-flow";
  const tenantId = "tenant-onboarding-1";
  const createdAt = new Date("2026-04-12T10:00:00.000Z");

  let publicStatus: "PENDING" | "APPROVED" = "PENDING";

  const publicApp = express();
  publicApp.use(express.json());
  publicApp.use("/api/tenant-requests", tenantRequestsRouter);

  const adminApp = express();
  adminApp.use(express.json());
  adminApp.use(authSuperAdmin());
  adminApp.use("/api/tenant-requests", tenantRequestsRouter);

  beforeEach(() => {
    vi.clearAllMocks();
    publicStatus = "PENDING";
    mockProvisionTenant.mockResolvedValue(undefined);
    mockApplyWorkspaceInviteSideEffects.mockResolvedValue(undefined);
    mockPrismaTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
    mockTenantRequest.create.mockResolvedValue({
      id: requestId,
      teamName: "Onboarding Team",
      slug,
      contactEmail: "owner-onb@test.local",
      contactName: "Owner Onb",
      message: null,
      preferredLocale: null,
      inviteEmails: null,
      trustCompanyDomain: false,
      trustedEmailDomain: null,
      status: "PENDING",
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      tenantId: null,
      createdAt,
      updatedAt: createdAt,
    });

    mockTenantRequest.findUnique.mockImplementation(
      (args: { where: { id?: string; slug?: string }; select?: Record<string, boolean> }) => {
        const w = args.where;
        if (w.slug !== undefined) {
          return Promise.resolve(null);
        }
        if (w.id === requestId) {
          if (args.select) {
            return Promise.resolve({
              id: requestId,
              teamName: "Onboarding Team",
              status: publicStatus,
              createdAt,
              reviewNote: null,
            });
          }
          return Promise.resolve({
            id: requestId,
            status: publicStatus,
            teamName: "Onboarding Team",
            slug,
            contactEmail: "owner-onb@test.local",
            contactName: "Owner Onb",
            inviteEmails: null,
            trustCompanyDomain: false,
            trustedEmailDomain: null,
            preferredLocale: null,
            message: null,
          });
        }
        return Promise.resolve(null);
      }
    );

    mockTenant.findUnique.mockImplementation((args: { where: { id?: string; slug?: string } }) => {
      if (args.where.slug !== undefined) {
        return Promise.resolve(null);
      }
      if (args.where.id === tenantId) {
        return Promise.resolve({
          id: tenantId,
          name: "Onboarding Team",
          slug,
          status: "ACTIVE",
        });
      }
      return Promise.resolve(null);
    });

    mockTenant.create.mockResolvedValue({
      id: tenantId,
      name: "Onboarding Team",
      slug,
      status: "PROVISIONING",
    });

    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({
      id: "user-onb-1",
      email: "owner-onb@test.local",
      name: "Owner Onb",
      role: UserRole.ADMIN,
      activeTenantId: tenantId,
    });
    mockTenantMembership.upsert.mockResolvedValue({
      tenantId,
      userId: "user-onb-1",
      role: "OWNER",
    });
    mockTenantRequest.update.mockResolvedValue({
      id: requestId,
      status: "APPROVED",
      tenantId,
      reviewedBy: "sa-onb",
      reviewedAt: new Date(),
      reviewNote: null,
    });
  });

  it("submit pending request → status PENDING → super-admin approve → APPROVED + ACTIVE tenant", async () => {
    const submit = await request(publicApp)
      .post("/api/tenant-requests")
      .send({
        teamName: "Onboarding Team",
        slug,
        contactEmail: "owner-onb@test.local",
        contactName: "Owner Onb",
      });

    expect(submit.status).toBe(201);
    expect(submit.body.id).toBe(requestId);
    expect(submit.body.status).toBe("PENDING");
    expect(mockTenantRequest.create).toHaveBeenCalled();

    const statusPending = await request(publicApp).get(`/api/tenant-requests/status/${requestId}`);
    expect(statusPending.status).toBe(200);
    expect(statusPending.body.status).toBe("PENDING");

    const review = await request(adminApp)
      .post(`/api/tenant-requests/${requestId}/review`)
      .send({ action: "approve", reviewNote: "ok" });

    expect(review.status).toBe(200);
    expect(review.body.request.status).toBe("APPROVED");
    expect(review.body.tenant.id).toBe(tenantId);
    expect(review.body.tenant.status).toBe("ACTIVE");
    expect(mockProvisionTenant).toHaveBeenCalledWith(tenantId);
    expect(mockTenantMembership.upsert).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId, userId: "user-onb-1" } },
      create: { tenantId, userId: "user-onb-1", role: "OWNER" },
      update: { role: "OWNER" },
    });

    publicStatus = "APPROVED";
    const statusApproved = await request(publicApp).get(`/api/tenant-requests/status/${requestId}`);
    expect(statusApproved.status).toBe(200);
    expect(statusApproved.body.status).toBe("APPROVED");
  });
});
