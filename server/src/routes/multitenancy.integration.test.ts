import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import {
  CommercialType,
  Horizon,
  InitiativeStatus,
  Priority,
  UserRole,
} from "@prisma/client";
import { prisma } from "../db.js";
import { tenantResolver } from "../tenant/tenantResolver.js";
import { requireTenant } from "../tenant/requireTenant.js";

/**
 * End-to-end multitenancy integration tests.
 *
 * Covers the full lifecycle:
 *   1. Admin creates a tenant
 *   2. Admin provisions the tenant (PROVISIONING → ACTIVE)
 *   3. Admin adds users as members
 *   4. User switches active tenant
 *   5. Data created in tenant A is invisible to tenant B
 *   6. Tenant suspension blocks access
 *   7. Member removal revokes access
 *   8. Cleanup
 *
 * Requires: RUN_DB_INTEGRATION_TESTS=1 and a valid DATABASE_URL.
 */
const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";

function authAs(userId: string, role: UserRole, activeTenantId?: string | null) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: userId,
      email: `${userId}@test.local`,
      name: "Test User",
      role,
      isActive: true,
      activeTenantId: activeTenantId ?? null,
    } as Express.User;
    next();
  };
}

function sessionStub() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.session) {
      req.session = {
        activeTenantId: undefined,
        save: (cb: (err?: Error) => void) => cb(),
      } as unknown as Request["session"];
    }
    next();
  };
}

describe.skipIf(!enabled)("Multitenancy E2E (HTTP integration)", () => {
  let suffix: string;

  // Users
  let superAdminId: string;
  let userAliceId: string;
  let userBobId: string;

  // Tenants
  let tenantAlphaId: string;
  let tenantBetaId: string;

  // Apps
  let appSuperAdmin: express.Express;
  let appAliceAlpha: express.Express;
  let appBobBeta: express.Express;
  let appAliceNoTenant: express.Express;

  // Data IDs for cleanup
  let alphaDomainId: string;
  let betaDomainId: string;
  let alphaProductId: string;
  let alphaInitiativeId: string;

  beforeAll(async () => {
    suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Create users
    const superAdmin = await prisma.user.create({
      data: {
        email: `it-mt-super-${suffix}@test.local`,
        name: "MT Super Admin",
        role: UserRole.SUPER_ADMIN,
        isActive: true,
      },
    });
    superAdminId = superAdmin.id;

    const alice = await prisma.user.create({
      data: {
        email: `it-mt-alice-${suffix}@test.local`,
        name: "Alice",
        role: UserRole.EDITOR,
        isActive: true,
      },
    });
    userAliceId = alice.id;

    const bob = await prisma.user.create({
      data: {
        email: `it-mt-bob-${suffix}@test.local`,
        name: "Bob",
        role: UserRole.EDITOR,
        isActive: true,
      },
    });
    userBobId = bob.id;
  });

  afterAll(async () => {
    try {
      // Clean up data in dependency order
      if (alphaInitiativeId) {
        await prisma.initiative.deleteMany({ where: { id: alphaInitiativeId } });
      }
      if (alphaProductId) {
        await prisma.product.deleteMany({ where: { id: alphaProductId } });
      }
      if (alphaDomainId) {
        await prisma.domain.deleteMany({ where: { id: alphaDomainId } });
      }
      if (betaDomainId) {
        await prisma.domain.deleteMany({ where: { id: betaDomainId } });
      }
      if (tenantAlphaId) {
        await prisma.tenantMembership.deleteMany({ where: { tenantId: tenantAlphaId } });
        await prisma.tenantMigrationState.deleteMany({ where: { tenantId: tenantAlphaId } });
        await prisma.tenant.deleteMany({ where: { id: tenantAlphaId } });
      }
      if (tenantBetaId) {
        await prisma.tenantMembership.deleteMany({ where: { tenantId: tenantBetaId } });
        await prisma.tenantMigrationState.deleteMany({ where: { tenantId: tenantBetaId } });
        await prisma.tenant.deleteMany({ where: { id: tenantBetaId } });
      }
      const ids = [superAdminId, userAliceId, userBobId].filter(Boolean);
      if (ids.length) {
        await prisma.auditEntry.deleteMany({ where: { userId: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  // ─── FLOW 1: Tenant creation & provisioning ─────────────────────

  it("1a. SUPER_ADMIN creates tenant Alpha", async () => {
    const { tenantsRouter } = await import("./tenants.js");
    const app = express();
    app.use(express.json());
    app.use(authAs(superAdminId, UserRole.SUPER_ADMIN));
    app.use("/api/tenants", tenantsRouter);
    appSuperAdmin = app;

    const res = await request(app)
      .post("/api/tenants")
      .send({ name: `Alpha-${suffix}`, slug: `alpha-${suffix}` });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`Alpha-${suffix}`);
    expect(res.body.status).toBe("PROVISIONING");
    expect(res.body.migrationState).toBeTruthy();
    tenantAlphaId = res.body.id;
  });

  it("1b. SUPER_ADMIN creates tenant Beta", async () => {
    const res = await request(appSuperAdmin)
      .post("/api/tenants")
      .send({ name: `Beta-${suffix}`, slug: `beta-${suffix}` });

    expect(res.status).toBe(201);
    tenantBetaId = res.body.id;
  });

  it("1c. Duplicate slug is rejected", async () => {
    const res = await request(appSuperAdmin)
      .post("/api/tenants")
      .send({ name: "Dup", slug: `alpha-${suffix}` });

    expect(res.status).toBe(500); // Prisma unique constraint error
  });

  it("1d. SUPER_ADMIN provisions tenant Alpha → ACTIVE", async () => {
    const res = await request(appSuperAdmin)
      .post(`/api/tenants/${tenantAlphaId}/provision`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.migrationState.status).toBe("current");
  });

  it("1e. SUPER_ADMIN provisions tenant Beta → ACTIVE", async () => {
    const res = await request(appSuperAdmin)
      .post(`/api/tenants/${tenantBetaId}/provision`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACTIVE");
  });

  it("1f. Provisioning an already-ACTIVE tenant fails", async () => {
    const res = await request(appSuperAdmin)
      .post(`/api/tenants/${tenantAlphaId}/provision`);

    expect(res.status).toBe(500);
  });

  it("1g. LIST tenants returns both", async () => {
    const res = await request(appSuperAdmin).get("/api/tenants");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((t: { id: string }) => t.id);
    expect(ids).toContain(tenantAlphaId);
    expect(ids).toContain(tenantBetaId);
  });

  it("1h. GET tenant by ID returns details", async () => {
    const res = await request(appSuperAdmin)
      .get(`/api/tenants/${tenantAlphaId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(tenantAlphaId);
    expect(res.body.memberships).toBeDefined();
  });

  it("1i. GET non-existent tenant returns 404", async () => {
    const res = await request(appSuperAdmin)
      .get("/api/tenants/non-existent-id");

    expect(res.status).toBe(404);
  });

  // ─── FLOW 2: Member management ──────────────────────────────────

  it("2a. Add Alice to Alpha as ADMIN", async () => {
    const res = await request(appSuperAdmin)
      .post(`/api/tenants/${tenantAlphaId}/members`)
      .send({ userId: userAliceId, role: "ADMIN" });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(userAliceId);
    expect(res.body.role).toBe("ADMIN");
  });

  it("2b. Add Bob to Beta as MEMBER", async () => {
    const res = await request(appSuperAdmin)
      .post(`/api/tenants/${tenantBetaId}/members`)
      .send({ userId: userBobId, role: "MEMBER" });

    expect(res.status).toBe(201);
  });

  it("2c. Add Alice to Beta as VIEWER (multi-tenant user)", async () => {
    const res = await request(appSuperAdmin)
      .post(`/api/tenants/${tenantBetaId}/members`)
      .send({ userId: userAliceId, role: "VIEWER" });

    expect(res.status).toBe(201);
  });

  it("2d. Adding same user to same tenant again fails (unique constraint)", async () => {
    const res = await request(appSuperAdmin)
      .post(`/api/tenants/${tenantAlphaId}/members`)
      .send({ userId: userAliceId, role: "MEMBER" });

    expect(res.status).toBe(500);
  });

  // ─── FLOW 3: User lists their tenants & switches ────────────────

  it("3a. Alice sees both Alpha and Beta in her tenants", async () => {
    const { meRouter } = await import("./me.js");
    const app = express();
    app.use(express.json());
    app.use(sessionStub());
    app.use(authAs(userAliceId, UserRole.EDITOR));
    app.use(tenantResolver);
    app.use("/api/me", meRouter);
    appAliceNoTenant = app;

    const res = await request(app).get("/api/me/tenants");

    expect(res.status).toBe(200);
    expect(res.body.tenants).toHaveLength(2);
    const tenantIds = res.body.tenants.map((m: { tenantId: string }) => m.tenantId);
    expect(tenantIds).toContain(tenantAlphaId);
    expect(tenantIds).toContain(tenantBetaId);
  });

  it("3b. Bob sees only Beta in his tenants", async () => {
    const { meRouter } = await import("./me.js");
    const app = express();
    app.use(express.json());
    app.use(sessionStub());
    app.use(authAs(userBobId, UserRole.EDITOR));
    app.use(tenantResolver);
    app.use("/api/me", meRouter);

    const res = await request(app).get("/api/me/tenants");

    expect(res.status).toBe(200);
    expect(res.body.tenants).toHaveLength(1);
    expect(res.body.tenants[0].tenantId).toBe(tenantBetaId);
  });

  it("3c. Alice switches to Alpha", async () => {
    const res = await request(appAliceNoTenant)
      .post("/api/me/tenants/switch")
      .send({ tenantId: tenantAlphaId });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.activeTenantId).toBe(tenantAlphaId);
  });

  it("3d. Alice cannot switch to a tenant she's not a member of", async () => {
    const fakeId = "non-existent-tenant-id";
    const res = await request(appAliceNoTenant)
      .post("/api/me/tenants/switch")
      .send({ tenantId: fakeId });

    expect(res.status).toBe(403);
  });

  it("3e. Switch with invalid body returns 400", async () => {
    const res = await request(appAliceNoTenant)
      .post("/api/me/tenants/switch")
      .send({});

    expect(res.status).toBe(400);
  });

  // ─── FLOW 4: Data isolation between tenants ─────────────────────

  it("4a. Set up apps with tenant context for Alice@Alpha and Bob@Beta", async () => {
    const { domainsRouter } = await import("./domains.js");
    const { productsRouter } = await import("./products.js");
    const { initiativesRouter } = await import("./initiatives.js");

    await prisma.user.update({ where: { id: userAliceId }, data: { activeTenantId: tenantAlphaId } });
    await prisma.user.update({ where: { id: userBobId }, data: { activeTenantId: tenantBetaId } });

    // ADMIN role needed for domain/product creation
    appAliceAlpha = express();
    appAliceAlpha.use(express.json());
    appAliceAlpha.use(sessionStub());
    appAliceAlpha.use(authAs(userAliceId, UserRole.ADMIN, tenantAlphaId));
    appAliceAlpha.use(tenantResolver);
    appAliceAlpha.use("/api/domains", domainsRouter);
    appAliceAlpha.use("/api/products", productsRouter);
    appAliceAlpha.use("/api/initiatives", initiativesRouter);

    appBobBeta = express();
    appBobBeta.use(express.json());
    appBobBeta.use(sessionStub());
    appBobBeta.use(authAs(userBobId, UserRole.ADMIN, tenantBetaId));
    appBobBeta.use(tenantResolver);
    appBobBeta.use("/api/domains", domainsRouter);
    appBobBeta.use("/api/products", productsRouter);
    appBobBeta.use("/api/initiatives", initiativesRouter);
  });

  it("4b. Alice creates a domain in Alpha", async () => {
    const res = await request(appAliceAlpha)
      .post("/api/domains")
      .send({ name: `Alpha Domain ${suffix}`, color: "#ff0000" });

    expect(res.status).toBe(201);
    alphaDomainId = res.body.domain.id;
  });

  it("4c. Bob creates a domain in Beta", async () => {
    const res = await request(appBobBeta)
      .post("/api/domains")
      .send({ name: `Beta Domain ${suffix}`, color: "#0000ff" });

    expect(res.status).toBe(201);
    betaDomainId = res.body.domain.id;
  });

  it("4d. Alice can see Alpha domain but NOT Beta domain", async () => {
    const res = await request(appAliceAlpha).get("/api/domains");

    expect(res.status).toBe(200);
    const names: string[] = res.body.domains.map((d: { name: string }) => d.name);
    expect(names).toContain(`Alpha Domain ${suffix}`);
    expect(names).not.toContain(`Beta Domain ${suffix}`);
  });

  it("4e. Bob can see Beta domain but NOT Alpha domain", async () => {
    const res = await request(appBobBeta).get("/api/domains");

    expect(res.status).toBe(200);
    const names: string[] = res.body.domains.map((d: { name: string }) => d.name);
    expect(names).toContain(`Beta Domain ${suffix}`);
    expect(names).not.toContain(`Alpha Domain ${suffix}`);
  });

  it("4f. Alice creates a product and initiative in Alpha", async () => {
    const prodRes = await request(appAliceAlpha)
      .post("/api/products")
      .send({ name: `Alpha Product ${suffix}` });
    expect(prodRes.status).toBe(201);
    alphaProductId = prodRes.body.product.id;

    const initRes = await request(appAliceAlpha)
      .post("/api/initiatives")
      .send({
        title: `Alpha Initiative ${suffix}`,
        domainId: alphaDomainId,
        productId: alphaProductId,
        priority: "P1",
        horizon: "NOW",
        status: "IDEA",
        commercialType: "CONTRACT_ENABLER",
      });
    expect(initRes.status).toBe(201);
    alphaInitiativeId = initRes.body.initiative.id;
  });

  it("4g. Bob cannot see Alpha's initiative from Beta", async () => {
    const res = await request(appBobBeta)
      .get("/api/initiatives?")
      .query({});

    expect(res.status).toBe(200);
    const titles: string[] = res.body.initiatives.map((i: { title: string }) => i.title);
    expect(titles).not.toContain(`Alpha Initiative ${suffix}`);
  });

  // ─── FLOW 5: Tenant update (rename, suspend) ───────────────────

  it("5a. SUPER_ADMIN renames tenant Alpha", async () => {
    const res = await request(appSuperAdmin)
      .patch(`/api/tenants/${tenantAlphaId}`)
      .send({ name: `Alpha Renamed ${suffix}` });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`Alpha Renamed ${suffix}`);
  });

  it("5b. SUPER_ADMIN suspends tenant Beta", async () => {
    const res = await request(appSuperAdmin)
      .patch(`/api/tenants/${tenantBetaId}`)
      .send({ status: "SUSPENDED" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUSPENDED");
  });

  it("5c. Bob cannot switch to suspended Beta", async () => {
    const { meRouter } = await import("./me.js");
    const app = express();
    app.use(express.json());
    app.use(sessionStub());
    app.use(authAs(userBobId, UserRole.EDITOR));
    app.use(tenantResolver);
    app.use("/api/me", meRouter);

    const res = await request(app)
      .post("/api/me/tenants/switch")
      .send({ tenantId: tenantBetaId });

    expect(res.status).toBe(403);
  });

  it("5d. SUPER_ADMIN reactivates tenant Beta", async () => {
    const res = await request(appSuperAdmin)
      .patch(`/api/tenants/${tenantBetaId}`)
      .send({ status: "ACTIVE" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACTIVE");
  });

  // ─── FLOW 6: Member removal ─────────────────────────────────────

  it("6a. Remove Alice from Beta", async () => {
    const res = await request(appSuperAdmin)
      .delete(`/api/tenants/${tenantBetaId}/members/${userAliceId}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("6b. Alice no longer sees Beta in her tenants", async () => {
    const { meRouter } = await import("./me.js");
    const app = express();
    app.use(express.json());
    app.use(sessionStub());
    app.use(authAs(userAliceId, UserRole.EDITOR, tenantAlphaId));
    app.use(tenantResolver);
    app.use("/api/me", meRouter);

    const res = await request(app).get("/api/me/tenants");

    expect(res.status).toBe(200);
    const tenantIds = res.body.tenants.map((m: { tenantId: string }) => m.tenantId);
    expect(tenantIds).toContain(tenantAlphaId);
    expect(tenantIds).not.toContain(tenantBetaId);
  });

  it("6c. Removing non-existent membership fails gracefully", async () => {
    const res = await request(appSuperAdmin)
      .delete(`/api/tenants/${tenantBetaId}/members/non-existent-user-id`);

    expect(res.status).toBe(500); // Prisma "record not found" error
  });

  // ─── FLOW 7: X-Tenant-Id header override ────────────────────────

  it("7a. Alice can query Alpha via X-Tenant-Id header", async () => {
    const { domainsRouter } = await import("./domains.js");
    const app = express();
    app.use(express.json());
    app.use(sessionStub());
    app.use(authAs(userAliceId, UserRole.ADMIN));
    app.use(tenantResolver);
    app.use("/api/domains", domainsRouter);

    const res = await request(app)
      .get("/api/domains")
      .set("X-Tenant-Id", tenantAlphaId);

    expect(res.status).toBe(200);
    const names: string[] = res.body.domains.map((d: { name: string }) => d.name);
    expect(names).toContain(`Alpha Domain ${suffix}`);
  });

  it("7b. Bob cannot use X-Tenant-Id to access Alpha (no membership)", async () => {
    const { domainsRouter } = await import("./domains.js");
    const app = express();
    app.use(express.json());
    app.use(sessionStub());
    app.use(authAs(userBobId, UserRole.EDITOR));
    app.use(tenantResolver);
    app.use(requireTenant);
    app.use("/api/domains", domainsRouter);

    const res = await request(app)
      .get("/api/domains")
      .set("X-Tenant-Id", tenantAlphaId);

    // Bob has no membership to Alpha → tenantResolver does not set context
    // requireTenant then blocks with 400
    expect(res.status).toBe(400);
  });

  // ─── FLOW 8: Edge cases ─────────────────────────────────────────

  it("8a. EDITOR cannot access tenant admin routes (RBAC)", async () => {
    const { tenantsRouter } = await import("./tenants.js");
    const app = express();
    app.use(express.json());
    app.use(authAs(userAliceId, UserRole.EDITOR));
    app.use("/api/tenants", tenantsRouter);

    const res = await request(app).get("/api/tenants");
    expect(res.status).toBe(403);
  });

  it("8b. VIEWER cannot access tenant admin routes", async () => {
    const { tenantsRouter } = await import("./tenants.js");
    const app = express();
    app.use(express.json());
    app.use(authAs(userBobId, UserRole.VIEWER));
    app.use("/api/tenants", tenantsRouter);

    const res = await request(app).get("/api/tenants");
    expect(res.status).toBe(403);
  });

  it("8c. Invalid slug format is rejected", async () => {
    const res = await request(appSuperAdmin)
      .post("/api/tenants")
      .send({ name: "Bad Slug", slug: "Has Spaces" });

    expect(res.status).toBe(500); // Zod parse throws inside try/catch → next(err) → 500
  });

  it("8d. Empty body for create tenant is rejected", async () => {
    const res = await request(appSuperAdmin)
      .post("/api/tenants")
      .send({});

    expect(res.status).toBe(500);
  });
});
