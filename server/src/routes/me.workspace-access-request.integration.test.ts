/**
 * HTTP + Postgres: workspace join request (WorkspaceAccessRequest) and fulfillment on add-member.
 *
 * Requires: `RUN_DB_INTEGRATION_TESTS=1`, `DATABASE_URL`, and migration
 * `20260416120000_workspace_access_request` applied (`npx prisma migrate deploy`).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { Prisma, UserRole } from "@prisma/client";
import { prisma, prismaUnscoped } from "../db.js";
import { provisionTenant } from "../tenant/tenantProvisioning.js";
import { meSessionRouter } from "./me.js";
import { tenantsRouter } from "./tenants.js";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";

async function workspaceAccessTableExists(): Promise<boolean> {
  if (!enabled) return false;
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'WorkspaceAccessRequest'
      ) AS exists
    `;
    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

const dbReady = await workspaceAccessTableExists();

function authAs(userId: string, email: string, role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: userId,
      email,
      name: "Integration User",
      role,
      isActive: true,
      activeTenantId: null,
    } as Express.User;
    next();
  };
}

describe.skipIf(!enabled || !dbReady)("Workspace access request (DB integration)", () => {
  let suffix: string;
  let outsiderId: string;
  let superAdminId: string;
  let tenantId: string;
  let tenantSlug: string;
  let outsiderApp: express.Express;
  let superApp: express.Express;

  beforeAll(async () => {
    suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    tenantSlug = `it-wa-${suffix}`.slice(0, 48);

    const outsider = await prisma.user.create({
      data: {
        email: `it-wa-out-${suffix}@test.local`,
        name: "Outsider",
        role: UserRole.EDITOR,
        isActive: true,
      },
    });
    outsiderId = outsider.id;

    const superU = await prisma.user.create({
      data: {
        email: `it-wa-sa-${suffix}@test.local`,
        name: "Super",
        role: UserRole.SUPER_ADMIN,
        isActive: true,
      },
    });
    superAdminId = superU.id;

    const schemaName = `tenant_it_wa_${suffix.replace(/[^a-z0-9]/gi, "_")}`.slice(0, 60);
    const tenant = await prisma.tenant.create({
      data: {
        name: `WA Int ${suffix}`,
        slug: tenantSlug,
        schemaName,
        status: "PROVISIONING",
        migrationState: { create: { schemaVersion: 0, status: "pending" } },
      },
    });
    tenantId = tenant.id;
    await provisionTenant(tenantId);

    await prisma.tenantMembership.create({
      data: { tenantId, userId: superAdminId, role: "OWNER" },
    });

    outsiderApp = express();
    outsiderApp.use(express.json());
    outsiderApp.use(authAs(outsiderId, outsider.email, UserRole.EDITOR));
    outsiderApp.use("/api/me", meSessionRouter);

    superApp = express();
    superApp.use(express.json());
    superApp.use(authAs(superAdminId, superU.email, UserRole.SUPER_ADMIN));
    superApp.use("/api/tenants", tenantsRouter);
  });

  afterAll(async () => {
    if (!tenantId) return;
    try {
      await prismaUnscoped.workspaceAccessRequest.deleteMany({ where: { tenantId } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021")) throw e;
    }
    try {
      await prisma.tenantMembership.deleteMany({ where: { tenantId } });
      await prisma.tenantMigrationState.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
      await prisma.user.deleteMany({ where: { id: { in: [outsiderId, superAdminId] } } });
    } catch (e) {
      console.error("[me.workspace-access-request.integration] cleanup failed:", e);
    }
  });

  it("runs full lifecycle: GET false, POST pending, GET true, POST idempotent, add member, GET false, row FULFILLED", async () => {
    const g0 = await request(outsiderApp).get(
      `/api/me/workspace-access-request?tenantSlug=${encodeURIComponent(tenantSlug)}`
    );
    expect(g0.status).toBe(200);
    expect(g0.body).toEqual({ pending: false });

    const p1 = await request(outsiderApp).post("/api/me/workspace-access-request").send({ tenantSlug });
    expect(p1.status).toBe(200);
    expect(p1.body).toMatchObject({
      pending: true,
      alreadyRequested: false,
      adminsNotified: expect.any(Boolean),
    });

    const g1 = await request(outsiderApp).get(
      `/api/me/workspace-access-request?tenantSlug=${encodeURIComponent(tenantSlug)}`
    );
    expect(g1.status).toBe(200);
    expect(g1.body).toEqual({ pending: true });

    const p2 = await request(outsiderApp).post("/api/me/workspace-access-request").send({ tenantSlug });
    expect(p2.status).toBe(200);
    expect(p2.body).toMatchObject({
      pending: true,
      alreadyRequested: true,
      adminsNotified: false,
    });

    const add = await request(superApp).post(`/api/tenants/${tenantId}/members`).send({
      userId: outsiderId,
      role: "MEMBER",
    });
    expect(add.status).toBe(201);

    const g2 = await request(outsiderApp).get(
      `/api/me/workspace-access-request?tenantSlug=${encodeURIComponent(tenantSlug)}`
    );
    expect(g2.status).toBe(200);
    expect(g2.body).toEqual({ pending: false });

    const row = await prismaUnscoped.workspaceAccessRequest.findUnique({
      where: { tenantId_userId: { tenantId, userId: outsiderId } },
    });
    expect(row?.status).toBe("FULFILLED");

    const p409 = await request(outsiderApp).post("/api/me/workspace-access-request").send({ tenantSlug });
    expect(p409.status).toBe(409);
  });
});
