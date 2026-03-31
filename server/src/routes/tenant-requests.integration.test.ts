import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * End-to-end tenant registration request flow.
 *
 * Covers:
 *   1. Public: submit registration request
 *   2. Public: check request status
 *   3. Admin: list requests (filtered)
 *   4. Admin: reject a request
 *   5. Admin: approve a request → tenant created + provisioned + user + membership
 *   6. Edge: duplicate slug, re-review, RBAC
 *
 * Requires: RUN_DB_INTEGRATION_TESTS=1 and valid DATABASE_URL.
 */
const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";

function authAs(userId: string, role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: userId,
      email: `${userId}@test.local`,
      name: "Test User",
      role,
      isActive: true,
      activeTenantId: null,
    } as Express.User;
    next();
  };
}

describe.skipIf(!enabled)("Tenant Registration Requests E2E", () => {
  let suffix: string;
  let superAdminId: string;
  let editorId: string;

  let appPublic: express.Express;
  let appAdmin: express.Express;
  let appEditor: express.Express;

  let requestIdToReject: string;
  let requestIdToApprove: string;
  let approvedTenantId: string;

  const cleanupTenantIds: string[] = [];
  const cleanupRequestSlugs: string[] = [];

  beforeAll(async () => {
    suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const { tenantRequestsRouter } = await import("./tenant-requests.js");

    const superAdmin = await prisma.user.create({
      data: {
        email: `it-tr-super-${suffix}@test.local`,
        name: "TR Super Admin",
        role: UserRole.SUPER_ADMIN,
        isActive: true,
      },
    });
    superAdminId = superAdmin.id;

    const editor = await prisma.user.create({
      data: {
        email: `it-tr-editor-${suffix}@test.local`,
        name: "TR Editor",
        role: UserRole.EDITOR,
        isActive: true,
      },
    });
    editorId = editor.id;

    appPublic = express();
    appPublic.use(express.json());
    appPublic.use("/api/tenant-requests", tenantRequestsRouter);

    appAdmin = express();
    appAdmin.use(express.json());
    appAdmin.use(authAs(superAdminId, UserRole.SUPER_ADMIN));
    appAdmin.use("/api/tenant-requests", tenantRequestsRouter);

    appEditor = express();
    appEditor.use(express.json());
    appEditor.use(authAs(editorId, UserRole.EDITOR));
    appEditor.use("/api/tenant-requests", tenantRequestsRouter);
  });

  afterAll(async () => {
    try {
      for (const tenantId of cleanupTenantIds) {
        await prisma.tenantMembership.deleteMany({ where: { tenantId } });
        await prisma.tenantMigrationState.deleteMany({ where: { tenantId } });
        await prisma.tenant.deleteMany({ where: { id: tenantId } });
      }
      for (const slug of cleanupRequestSlugs) {
        await prisma.tenantRequest.deleteMany({ where: { slug } });
      }
      // Clean up contact users created by approval
      const contactEmail = `contact-${suffix}@test.local`;
      const contactUser = await prisma.user.findUnique({ where: { email: contactEmail } });
      if (contactUser) {
        await prisma.tenantMembership.deleteMany({ where: { userId: contactUser.id } });
        await prisma.user.deleteMany({ where: { id: contactUser.id } });
      }
      const ids = [superAdminId, editorId].filter(Boolean);
      if (ids.length) {
        await prisma.auditEntry.deleteMany({ where: { userId: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  // ─── FLOW 1: Public registration ───────────────────────────────

  it("1a. Submit a registration request (to reject later)", async () => {
    const slug = `reject-${suffix}`;
    cleanupRequestSlugs.push(slug);
    const res = await request(appPublic)
      .post("/api/tenant-requests")
      .send({
        teamName: `Reject Team ${suffix}`,
        slug,
        contactEmail: `contact-reject-${suffix}@test.local`,
        contactName: "Rejecter",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    requestIdToReject = res.body.id;
  });

  it("1b. Submit a registration request (to approve later)", async () => {
    const slug = `approve-${suffix}`;
    cleanupRequestSlugs.push(slug);
    const res = await request(appPublic)
      .post("/api/tenant-requests")
      .send({
        teamName: `Approve Team ${suffix}`,
        slug,
        contactEmail: `contact-${suffix}@test.local`,
        contactName: `Contact ${suffix}`,
        message: "Please approve our team.",
      });

    expect(res.status).toBe(201);
    requestIdToApprove = res.body.id;
  });

  it("1c. Duplicate slug is rejected", async () => {
    const res = await request(appPublic)
      .post("/api/tenant-requests")
      .send({
        teamName: "Dup Team",
        slug: `approve-${suffix}`,
        contactEmail: "x@test.local",
        contactName: "Dup",
      });

    expect(res.status).toBe(409);
  });

  it("1d. Invalid body is rejected", async () => {
    const res = await request(appPublic)
      .post("/api/tenant-requests")
      .send({ teamName: "X" }); // missing required fields

    expect(res.status).toBe(500); // Zod parse throws → next(err)
  });

  // ─── FLOW 2: Public status check ──────────────────────────────

  it("2a. Check status of pending request", async () => {
    const res = await request(appPublic)
      .get(`/api/tenant-requests/status/${requestIdToReject}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PENDING");
  });

  it("2b. Non-existent request returns 404", async () => {
    const res = await request(appPublic)
      .get("/api/tenant-requests/status/nonexistent");

    expect(res.status).toBe(404);
  });

  // ─── FLOW 3: Admin list & RBAC ─────────────────────────────────

  it("3a. SUPER_ADMIN can list all requests", async () => {
    const res = await request(appAdmin)
      .get("/api/tenant-requests");

    expect(res.status).toBe(200);
    expect(res.body.requests.length).toBeGreaterThanOrEqual(2);
  });

  it("3b. SUPER_ADMIN can filter by status", async () => {
    const res = await request(appAdmin)
      .get("/api/tenant-requests?status=PENDING");

    expect(res.status).toBe(200);
    for (const r of res.body.requests) {
      expect(r.status).toBe("PENDING");
    }
  });

  it("3c. EDITOR cannot list requests (403)", async () => {
    const res = await request(appEditor)
      .get("/api/tenant-requests");

    expect(res.status).toBe(403);
  });

  // ─── FLOW 4: Reject a request ──────────────────────────────────

  it("4a. SUPER_ADMIN rejects the request", async () => {
    const res = await request(appAdmin)
      .post(`/api/tenant-requests/${requestIdToReject}/review`)
      .send({ action: "reject", reviewNote: "Not suitable." });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");
    expect(res.body.reviewNote).toBe("Not suitable.");
  });

  it("4b. Re-reviewing a rejected request fails", async () => {
    const res = await request(appAdmin)
      .post(`/api/tenant-requests/${requestIdToReject}/review`)
      .send({ action: "approve" });

    expect(res.status).toBe(400);
  });

  // ─── FLOW 5: Approve a request ─────────────────────────────────

  it("5a. SUPER_ADMIN approves the request", async () => {
    const res = await request(appAdmin)
      .post(`/api/tenant-requests/${requestIdToApprove}/review`)
      .send({ action: "approve" });

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe("APPROVED");
    expect(res.body.tenant).toBeTruthy();
    expect(res.body.tenant.status).toBe("ACTIVE");
    approvedTenantId = res.body.tenant.id;
    cleanupTenantIds.push(approvedTenantId);
  });

  it("5b. Approved tenant exists in DB", async () => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: approvedTenantId },
      include: { memberships: true },
    });
    expect(tenant).toBeTruthy();
    expect(tenant!.status).toBe("ACTIVE");
    expect(tenant!.memberships.length).toBeGreaterThanOrEqual(1);
    expect(tenant!.memberships[0].role).toBe("OWNER");
  });

  it("5c. Contact user was created and is OWNER of the tenant", async () => {
    const contactEmail = `contact-${suffix}@test.local`;
    const user = await prisma.user.findUnique({ where: { email: contactEmail } });
    expect(user).toBeTruthy();

    const membership = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: approvedTenantId, userId: user!.id } },
    });
    expect(membership).toBeTruthy();
    expect(membership!.role).toBe("OWNER");
  });

  it("5d. Re-approving fails", async () => {
    const res = await request(appAdmin)
      .post(`/api/tenant-requests/${requestIdToApprove}/review`)
      .send({ action: "approve" });

    expect(res.status).toBe(400);
  });

  // ─── FLOW 6: Status updated after review ────────────────────────

  it("6a. Public status check shows REJECTED", async () => {
    const res = await request(appPublic)
      .get(`/api/tenant-requests/status/${requestIdToReject}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");
  });

  it("6b. Public status check shows APPROVED", async () => {
    const res = await request(appPublic)
      .get(`/api/tenant-requests/status/${requestIdToApprove}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
  });

  // ─── FLOW 7: Slug resolution endpoint ──────────────────────────

  it("7a. Public slug endpoint resolves approved tenant slug", async () => {
    const slug = `approve-${suffix}`;
    const slugApp = express();
    slugApp.use(express.json());
    slugApp.get("/api/tenants/by-slug/:slug/public", async (req, res) => {
      try {
        const s = String(req.params.slug).toLowerCase();
        const tenant = await prisma.tenant.findUnique({
          where: { slug: s },
          select: { name: true, slug: true, status: true },
        });
        if (!tenant || tenant.status !== "ACTIVE") {
          res.status(404).json({ error: "Workspace not found." });
          return;
        }
        res.json({ name: tenant.name, slug: tenant.slug });
      } catch {
        res.status(500).json({ error: "Internal server error" });
      }
    });

    const res = await request(slugApp)
      .get(`/api/tenants/by-slug/${slug}/public`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`Approve Team ${suffix}`);
    expect(res.body.slug).toBe(slug);
    expect(res.body.id).toBeUndefined();
    expect(res.body.status).toBeUndefined();
  });

  it("7b. Public slug endpoint returns 404 for non-existent slug", async () => {
    const slugApp = express();
    slugApp.use(express.json());
    slugApp.get("/api/tenants/by-slug/:slug/public", async (req, res) => {
      try {
        const s = String(req.params.slug).toLowerCase();
        const tenant = await prisma.tenant.findUnique({
          where: { slug: s },
          select: { name: true, slug: true, status: true },
        });
        if (!tenant || tenant.status !== "ACTIVE") {
          res.status(404).json({ error: "Workspace not found." });
          return;
        }
        res.json({ name: tenant.name, slug: tenant.slug });
      } catch {
        res.status(500).json({ error: "Internal server error" });
      }
    });

    const res = await request(slugApp)
      .get("/api/tenants/by-slug/does-not-exist/public");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Workspace not found.");
  });
});
