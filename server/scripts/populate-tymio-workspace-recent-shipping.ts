/**
 * Seeds the **tymio** workspace (tenant slug `tymio`) with epics, features, and tasks
 * for recently shipped platform/client work. Idempotent: skips existing rows matched by title.
 *
 * For **Tymio hub roadmap** (product backlog on tymio.app), prefer **MCP** (`drd_*` tools with
 * `workspaceSlug: "tymio"`) or the Tymio CLI — not this script — so work is created through the product API.
 *
 * Run: npm run db:populate-tymio-recent --workspace server
 * Requires DATABASE_URL (e.g. server/.env). Tenant must exist and be ACTIVE (see prisma seed).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import {
  CommercialType,
  FeatureStatus,
  Horizon,
  InitiativeStatus,
  Priority,
  PrismaClient,
  TaskStatus,
  TenantStatus,
  TopLevelItemType,
} from "@prisma/client";
import { createTenantExtension } from "../src/tenant/tenantPrisma.js";
import { runWithTenant, type TenantContext } from "../src/tenant/tenantContext.js";

const base = new PrismaClient();
const prisma = createTenantExtension(base);

const TENANT_SLUG = "tymio";
/** Epics and shipping narrative live on the main app product (single explorer tree). */
const PRODUCT_SLUG = "tymio-web-app";
const DOMAIN_NAME = "Platforma";

async function ensureDomain() {
  let d = await prisma.domain.findFirst({ where: { name: DOMAIN_NAME } });
  if (!d) {
    const maxOrder = await prisma.domain.findFirst({ orderBy: { sortOrder: "desc" } });
    const sortOrder = (maxOrder?.sortOrder ?? 0) + 1;
    d = await prisma.domain.create({
      data: { name: DOMAIN_NAME, color: "#d97706", sortOrder },
    });
    console.log("Created domain:", d.name);
  } else {
    console.log("Using domain:", d.name);
  }
  return d;
}

async function ensureProduct() {
  let p = await prisma.product.findFirst({ where: { slug: PRODUCT_SLUG } });
  if (!p) {
    const maxSo = await prisma.product.findFirst({ orderBy: { sortOrder: "desc" } });
    p = await prisma.product.create({
      data: {
        name: "Tymio Web App",
        slug: PRODUCT_SLUG,
        description: "Primary Tymio web application — roadmap and shipped work.",
        sortOrder: (maxSo?.sortOrder ?? 0) + 1,
        itemType: TopLevelItemType.PRODUCT,
      },
    });
    await prisma.executionBoard.create({
      data: {
        productId: p.id,
        name: "Delivery",
        isDefault: true,
        columns: {
          create: [
            { name: "Backlog", sortOrder: 0, mappedStatus: TaskStatus.NOT_STARTED, isDefault: true },
            { name: "In progress", sortOrder: 1, mappedStatus: TaskStatus.IN_PROGRESS, isDefault: false },
            { name: "Testing", sortOrder: 2, mappedStatus: TaskStatus.TESTING, isDefault: false },
            { name: "Done", sortOrder: 3, mappedStatus: TaskStatus.DONE, isDefault: false },
          ],
        },
      },
    });
    console.log("Created product + default board:", p.name);
  } else {
    console.log("Using product:", p.name);
  }
  return p;
}

async function ensureEpic(
  domainId: string,
  productId: string,
  title: string,
  status: InitiativeStatus,
  description: string | null,
  sortOrder: number
) {
  let e = await prisma.initiative.findFirst({
    where: { domainId, title, isEpic: true },
  });
  if (!e) {
    e = await prisma.initiative.create({
      data: {
        title,
        description,
        domainId,
        productId,
        isEpic: true,
        priority: Priority.P1,
        horizon: Horizon.NOW,
        status,
        commercialType: CommercialType.CARE_QUALITY,
        sortOrder,
      },
    });
    console.log("Created epic:", title);
  } else {
    console.log("Epic already exists:", title);
  }
  return e;
}

async function ensureFeature(
  initiativeId: string,
  title: string,
  status: FeatureStatus,
  sortOrder: number,
  description?: string | null
) {
  let f = await prisma.feature.findFirst({ where: { initiativeId, title } });
  if (!f) {
    f = await prisma.feature.create({
      data: {
        initiativeId,
        title,
        description: description ?? null,
        status,
        sortOrder,
      },
    });
    console.log("  Created feature:", title);
  } else {
    console.log("  Feature exists:", title);
  }
  return f;
}

async function ensureRequirement(
  featureId: string,
  title: string,
  opts: { description?: string | null; status: TaskStatus; isDone: boolean; sortOrder: number }
) {
  const existing = await prisma.requirement.findFirst({ where: { featureId, title } });
  if (existing) return existing;
  return prisma.requirement.create({
    data: {
      featureId,
      title,
      description: opts.description ?? null,
      status: opts.status,
      isDone: opts.isDone,
      priority: Priority.P2,
      sortOrder: opts.sortOrder,
    },
  });
}

async function seedRecentShipping(domainId: string, productId: string) {
  const epicUx = await ensureEpic(
    domainId,
    productId,
    "Q2 2026 — Client & platform UX",
    InitiativeStatus.IN_PROGRESS,
    "Product Explorer, execution board, and workspace navigation improvements shipped or in flight.",
    1
  );

  const fExplorer = await ensureFeature(
    epicUx.id,
    "Product Explorer",
    FeatureStatus.DONE,
    1,
    "Tree reorder, hierarchy, and build stability."
  );
  let o = 0;
  await ensureRequirement(fExplorer.id, "Optimistic epic/feature reorder (no flicker on save)", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });
  await ensureRequirement(fExplorer.id, "Reorder respects epic vs feature hierarchy in tree", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });
  await ensureRequirement(fExplorer.id, "Row tint / visual feedback while reordering", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });
  await ensureRequirement(fExplorer.id, "treeProductId typing fix for production TypeScript build", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });

  const fBoard = await ensureFeature(
    epicUx.id,
    "Execution board",
    FeatureStatus.DONE,
    2,
    "Done column and status mapping from requirements."
  );
  o = 0;
  await ensureRequirement(fBoard.id, "Merge platform and workspace hidden paths for column config", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });
  await ensureRequirement(fBoard.id, "Done requirements map to Done column via merged nav settings", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });

  const fNav = await ensureFeature(
    epicUx.id,
    "Workspace navigation & UI settings",
    FeatureStatus.IN_PROGRESS,
    3,
    "Per-tenant views, API persistence, multi-tab tenant context."
  );
  o = 0;
  await ensureRequirement(fNav.id, "GET/PUT /api/ui-settings and workspace-scoped merge", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });
  await ensureRequirement(fNav.id, "X-Tenant-Id + sessionStorage for active workspace across tabs", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });
  await ensureRequirement(fNav.id, "CORS allow X-Tenant-Id for browser API calls", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });
  await ensureRequirement(fNav.id, "Workspace Settings section in sidebar (i18n)", {
    status: TaskStatus.IN_PROGRESS,
    isDone: false,
    sortOrder: o++,
  });

  const epicAuth = await ensureEpic(
    domainId,
    productId,
    "Q2 2026 — Authentication & identity",
    InitiativeStatus.DONE,
    "OAuth consolidation, Microsoft sign-in, and email magic link.",
    2
  );

  const fOauthSvc = await ensureFeature(
    epicAuth.id,
    "Shared OAuth user service",
    FeatureStatus.DONE,
    1,
    "Refactor passport + MCP OAuth provider to shared service; tests."
  );
  o = 0;
  await ensureRequirement(fOauthSvc.id, "Extract oauthUserService; wire passport and MCP provider", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });
  await ensureRequirement(fOauthSvc.id, "Regression tests for OAuth flows", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });

  const fMs = await ensureFeature(epicAuth.id, "Microsoft sign-in", FeatureStatus.DONE, 2, "Passport routes, Prisma field, client + i18n.");
  o = 0;
  await ensureRequirement(fMs.id, "Prisma microsoftId + migration; env schema", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });
  await ensureRequirement(fMs.id, "Microsoft OAuth routes and sign-in button", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });

  const fMagic = await ensureFeature(epicAuth.id, "Email magic link", FeatureStatus.DONE, 3, "Passwordless login via EmailLoginToken.");
  o = 0;
  await ensureRequirement(fMagic.id, "POST request-link + GET verify; rate limits; SMTP", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });
  await ensureRequirement(fMagic.id, "Client entry points and i18n", {
    status: TaskStatus.DONE,
    isDone: true,
    sortOrder: o++,
  });
}

async function main() {
  const tenant = await base.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    throw new Error(`Tenant with slug "${TENANT_SLUG}" not found. Run prisma seed first.`);
  }
  if (tenant.status !== TenantStatus.ACTIVE) {
    throw new Error(`Tenant "${TENANT_SLUG}" is not ACTIVE (status: ${tenant.status}).`);
  }

  const ctx: TenantContext = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    schemaName: tenant.schemaName,
    membershipRole: "OWNER",
  };

  console.log(`Populating workspace tenant: ${tenant.slug} (${tenant.id})`);

  await runWithTenant(ctx, async () => {
    const domain = await ensureDomain();
    const product = await ensureProduct();
    await seedRecentShipping(domain.id, product.id);
  });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await base.$disconnect();
  });
