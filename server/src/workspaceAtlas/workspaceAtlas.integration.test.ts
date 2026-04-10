import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import {
  CommercialType,
  Horizon,
  InitiativeStatus,
  MembershipRole,
  Priority,
  TenantStatus,
  UserRole
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * HTTP + Postgres + filesystem: PATCH initiative → notifyHubChange → debounced compile → atlas JSON on disk.
 *
 * Requires RUN_DB_INTEGRATION_TESTS=1 and DATABASE_URL (see other *.integration.test.ts).
 *
 * Important: `WORKSPACE_ATLAS_*` env vars are set in `beforeAll` **before** any dynamic import of
 * server modules that load `env.ts`, so paths + debounce match this test’s temp directory.
 */
const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";

function authAs(userId: string, role: UserRole, activeTenantId: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: userId,
      email: `${userId}@test.local`,
      name: "Atlas IT User",
      role,
      isActive: true,
      activeTenantId
    } as Express.User;
    next();
  };
}

function sessionStub() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.session) {
      req.session = {
        activeTenantId: undefined,
        save: (cb: (err?: Error) => void) => cb()
      } as unknown as Request["session"];
    }
    next();
  };
}

describe.skipIf(!enabled)("workspace atlas: hub change → debounced rebuild (HTTP integration)", () => {
  let atlasRoot: string | undefined;
  let suffix: string;
  let tenantId: string;
  let userId: string;
  let domainId: string;
  let productId: string;
  let initiativeId: string;
  let app: express.Express;
  let readWorkspaceAtlas: typeof import("./store.js").readWorkspaceAtlas;
  let prisma: typeof import("../db.js").prisma | undefined;

  beforeAll(async () => {
    atlasRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-atlas-it-"));
    process.env.WORKSPACE_ATLAS_DEBOUNCE_MS = "200";
    process.env.WORKSPACE_ATLAS_DATA_DIR = atlasRoot;

    await import("./hubListener.js").then((m) => m.startWorkspaceAtlasHubListener());

    const db = await import("../db.js");
    prisma = db.prisma;
    readWorkspaceAtlas = (await import("./store.js")).readWorkspaceAtlas;

    const { initiativesRouter } = await import("../routes/initiatives.js");
    const { requireAuth } = await import("../middleware/auth.js");
    const { requireTenant } = await import("../tenant/requireTenant.js");
    const { tenantResolver } = await import("../tenant/tenantResolver.js");
    const { slugify } = await import("../lib/productSlug.js");

    suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const tenant = await prisma.tenant.create({
      data: {
        name: `Atlas IT ${suffix}`,
        slug: `atlas-it-${suffix}`,
        schemaName: `t_wa_${suffix.replace(/-/g, "_")}`,
        status: TenantStatus.ACTIVE,
        migrationState: { create: {} }
      }
    });
    tenantId = tenant.id;

    const user = await prisma.user.create({
      data: {
        email: `atlas-it-user-${suffix}@test.local`,
        name: "Atlas IT",
        role: UserRole.EDITOR,
        activeTenantId: tenantId
      }
    });
    userId = user.id;

    await prisma.tenantMembership.create({
      data: {
        tenantId,
        userId,
        role: MembershipRole.OWNER
      }
    });

    const domain = await prisma.domain.create({
      data: {
        tenantId,
        name: `Atlas-Domain-${suffix}`,
        color: "#222222",
        sortOrder: 0
      }
    });
    domainId = domain.id;

    const product = await prisma.product.create({
      data: {
        tenantId,
        name: `Atlas-Product-${suffix}`,
        slug: slugify(`atlas-product-${suffix}`),
        sortOrder: 0
      }
    });
    productId = product.id;

    const initiative = await prisma.initiative.create({
      data: {
        tenantId,
        productId,
        title: "Atlas Initial Title",
        domainId,
        priority: Priority.P1,
        horizon: Horizon.NOW,
        status: InitiativeStatus.IN_PROGRESS,
        commercialType: CommercialType.CONTRACT_ENABLER
      }
    });
    initiativeId = initiative.id;

    app = express();
    app.use(express.json());
    app.use(sessionStub());
    app.use(authAs(userId, UserRole.EDITOR, tenantId));
    app.use(tenantResolver);
    app.use("/api/initiatives", requireAuth, requireTenant, initiativesRouter);
  });

  afterAll(async () => {
    try {
      if (prisma) {
        if (initiativeId) {
          await prisma.initiative.deleteMany({ where: { id: initiativeId } });
        }
        if (productId) {
          await prisma.product.deleteMany({ where: { id: productId } });
        }
        if (domainId) {
          await prisma.domain.deleteMany({ where: { id: domainId } });
        }
        if (tenantId) {
          await prisma.tenantMembership.deleteMany({ where: { tenantId } });
          await prisma.tenantMigrationState.deleteMany({ where: { tenantId } });
          await prisma.tenant.deleteMany({ where: { id: tenantId } });
        }
        if (userId) {
          await prisma.auditEntry.deleteMany({ where: { userId } });
          await prisma.user.deleteMany({ where: { id: userId } });
        }
      }
    } finally {
      try {
        if (atlasRoot) fs.rmSync(atlasRoot, { recursive: true, force: true });
      } catch {
        /* temp dir may already be gone */
      }
      if (prisma) await prisma.$disconnect();
    }
  });

  async function waitForAtlasTitle(substring: string, timeoutMs = 15_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const atlas = await readWorkspaceAtlas(tenantId);
      const ok = atlas?.initiativeIndex?.some((i) => i.title.includes(substring));
      if (ok) return atlas!;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error(`Timeout waiting for atlas to include initiative title "${substring}"`);
  }

  it("PATCH initiative updates workspace-atlas.json and initiative shard after debounced compile", async () => {
    expect(await readWorkspaceAtlas(tenantId)).toBeNull();

    const put = await request(app)
      .put(`/api/initiatives/${initiativeId}`)
      .set("X-Tenant-Id", tenantId)
      .send({ title: "Atlas Updated Title" });

    expect(put.status).toBe(200);
    expect(put.body.initiative.title).toBe("Atlas Updated Title");

    const atlas = await waitForAtlasTitle("Atlas Updated");
    const idx = atlas.initiativeIndex.find((i) => i.id === initiativeId);
    expect(idx?.title).toBe("Atlas Updated Title");

    const atlasPath = path.join(atlasRoot, tenantId, "workspace-atlas.json");
    expect(fs.existsSync(atlasPath)).toBe(true);
    expect(fs.readFileSync(atlasPath, "utf8")).toContain("Atlas Updated Title");

    const shardPath = path.join(atlasRoot, tenantId, "objects", "INITIATIVE", `${initiativeId}.json`);
    expect(fs.existsSync(shardPath)).toBe(true);
    const shard = JSON.parse(fs.readFileSync(shardPath, "utf8")) as { facts?: { title?: string } };
    expect(shard.facts?.title).toBe("Atlas Updated Title");
  });
});
