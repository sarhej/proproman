/**
 * One-time (idempotent): move all initiatives from product slug `tymio-engineering`
 * to `tymio-web-app`, clear execution-board column refs that pointed at the old
 * product's boards, then delete the engineering product (and its boards).
 *
 * Run from server/:  npx tsx scripts/merge-tymio-engineering-into-web-app.ts
 * Requires DATABASE_URL (e.g. server/.env). Tenant slug must be `tymio`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { PrismaClient, TenantStatus } from "@prisma/client";
import { createTenantExtension } from "../src/tenant/tenantPrisma.js";
import { runWithTenant, type TenantContext } from "../src/tenant/tenantContext.js";

const base = new PrismaClient();
const prisma = createTenantExtension(base);

const TENANT_SLUG = "tymio";
const SOURCE_SLUG = "tymio-engineering";
const TARGET_SLUG = "tymio-web-app";

async function main() {
  const tenant = await base.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    throw new Error(`Tenant "${TENANT_SLUG}" not found.`);
  }
  if (tenant.status !== TenantStatus.ACTIVE) {
    throw new Error(`Tenant "${TENANT_SLUG}" is not ACTIVE.`);
  }

  const ctx: TenantContext = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    schemaName: tenant.schemaName,
    membershipRole: "OWNER",
  };

  await runWithTenant(ctx, async () => {
    const target = await prisma.product.findFirst({ where: { slug: TARGET_SLUG } });
    if (!target) {
      throw new Error(`Product slug "${TARGET_SLUG}" not found in workspace.`);
    }

    const source = await prisma.product.findFirst({ where: { slug: SOURCE_SLUG } });
    if (!source) {
      console.log(`No product "${SOURCE_SLUG}" — already merged or never created. Done.`);
      return;
    }

    if (source.id === target.id) {
      console.log("Source and target are the same. Done.");
      return;
    }

    const boards = await prisma.executionBoard.findMany({
      where: { productId: source.id },
      select: { id: true },
    });
    const boardIds = boards.map((b) => b.id);
    const columns =
      boardIds.length > 0
        ? await prisma.executionColumn.findMany({
            where: { boardId: { in: boardIds } },
            select: { id: true },
          })
        : [];
    const columnIds = columns.map((c) => c.id);

    if (columnIds.length > 0) {
      const cleared = await prisma.requirement.updateMany({
        where: { executionColumnId: { in: columnIds } },
        data: { executionColumnId: null },
      });
      console.log(`Cleared executionColumnId on ${cleared.count} requirement(s) tied to old boards.`);
    }

    const moved = await prisma.initiative.updateMany({
      where: { productId: source.id },
      data: { productId: target.id },
    });
    console.log(`Moved ${moved.count} initiative(s) to "${target.name}" (${TARGET_SLUG}).`);

    await prisma.product.delete({ where: { id: source.id } });
    console.log(`Deleted product "${source.name}" (${SOURCE_SLUG}) and its execution boards.`);
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
