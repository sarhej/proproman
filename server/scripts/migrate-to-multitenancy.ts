/**
 * One-time migration script: Convert single-tenant Tymio to multitenant.
 *
 * What it does:
 * 1. Creates a "default" Tenant row in the control plane.
 * 2. Adds all existing users as MEMBER of that tenant.
 * 3. Backfills tenantId on all business data rows.
 * 4. Sets the first SUPER_ADMIN as tenant OWNER.
 * 5. Sets each user's activeTenantId to the default tenant.
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   npx tsx server/scripts/migrate-to-multitenancy.ts [--slug my-org] [--name "My Organization"]
 */

import { PrismaClient } from "@prisma/client";
import { createTenantExtension } from "../src/tenant/tenantPrisma.js";

const args = process.argv.slice(2);
function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const SLUG = getArg("--slug", "default");
const NAME = getArg("--name", "Default Workspace");

async function main() {
  const base = new PrismaClient();
  const prisma = createTenantExtension(base);

  console.log("=== Tymio Multitenancy Migration ===\n");

  // 1. Create or find default tenant
  let tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (tenant) {
    console.log(`✓ Tenant "${tenant.name}" (${tenant.slug}) already exists: ${tenant.id}`);
  } else {
    const schemaName = `tenant_${SLUG.replace(/-/g, "_")}`;
    tenant = await prisma.tenant.create({
      data: {
        name: NAME,
        slug: SLUG,
        schemaName,
        status: "ACTIVE",
        migrationState: {
          create: { schemaVersion: 1, status: "current", lastMigratedAt: new Date() },
        },
      },
    });
    console.log(`✓ Created tenant "${tenant.name}" (${tenant.slug}): ${tenant.id}`);
  }

  const tenantId = tenant.id;

  // 2. Add all existing users as members
  const users = await prisma.user.findMany({ select: { id: true, role: true, email: true } });
  let membershipsCreated = 0;
  for (const user of users) {
    const existing = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });
    if (!existing) {
      const memberRole = user.role === "SUPER_ADMIN" ? "OWNER" : user.role === "ADMIN" ? "ADMIN" : "MEMBER";
      await prisma.tenantMembership.create({
        data: { tenantId, userId: user.id, role: memberRole as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" },
      });
      membershipsCreated++;
    }
  }
  console.log(`✓ Ensured ${users.length} users are members (${membershipsCreated} new memberships)`);

  // 3. Backfill tenantId on all business data
  const tables = [
    "Product", "ExecutionBoard", "ExecutionColumn", "Domain", "Persona",
    "RevenueStream", "Initiative", "SuccessCriterion", "InitiativeComment",
    "Feature", "Requirement", "Decision", "Risk", "Account", "Partner",
    "Demand", "DemandLink", "InitiativeAssignment", "Campaign", "Asset",
    "CampaignLink", "InitiativeMilestone", "InitiativeKPI", "Stakeholder",
    "AuditEntry", "UserMessage", "NotificationRule",
    "UserNotificationSubscription", "UserNotificationPreference",
    "NotificationDelivery",
  ];

  let totalBackfilled = 0;
  for (const table of tables) {
    const count: number = await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "tenantId" = $1 WHERE "tenantId" IS NULL`,
      tenantId
    );
    if (count > 0) {
      console.log(`  ${table}: ${count} rows`);
      totalBackfilled += count;
    }
  }
  console.log(`✓ Backfilled tenantId on ${totalBackfilled} rows across ${tables.length} tables`);

  // 4. Set activeTenantId on all users
  const updateCount = await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "activeTenantId" = $1 WHERE "activeTenantId" IS NULL`,
    tenantId
  );
  console.log(`✓ Set activeTenantId for ${updateCount} users`);

  // 5. Summary
  console.log("\n=== Migration Complete ===");
  console.log(`Tenant ID:   ${tenantId}`);
  console.log(`Tenant slug: ${SLUG}`);
  console.log(`Schema:      ${tenant.schemaName}`);
  console.log(`Users:       ${users.length}`);
  console.log(`Rows:        ${totalBackfilled}`);
  console.log("\nNext steps:");
  console.log("  1. Verify application works with the default tenant");
  console.log("  2. Test tenant switching via X-Tenant-Id header");
  console.log("  3. Create additional tenants via POST /api/tenants");

  await base.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
