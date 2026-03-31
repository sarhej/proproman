import { prisma } from "../db.js";
import { Prisma } from "@prisma/client";

/**
 * Provision a new tenant's database schema and seed required data.
 * Called after creating the Tenant row in the control plane.
 *
 * For the initial row-scoped multitenancy phase, this just:
 * 1. Activates the tenant
 * 2. Sets migration state to current version
 *
 * When we move to schema-per-tenant, this will:
 * 1. CREATE SCHEMA tenant_<slug>
 * 2. Run tenant DDL migrations inside that schema
 * 3. Seed default data (domains, personas, etc.)
 */
export async function provisionTenant(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { migrationState: true },
  });

  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
  if (tenant.status !== "PROVISIONING") {
    throw new Error(`Tenant ${tenantId} is not in PROVISIONING state (current: ${tenant.status})`);
  }

  try {
    // Phase 1: row-scoped — no schema creation needed.
    // Future: CREATE SCHEMA "tenant_<slug>" and run DDL here.

    await prisma.$transaction([
      prisma.tenantMigrationState.upsert({
        where: { tenantId },
        create: {
          tenantId,
          schemaVersion: 1,
          status: "current",
          lastMigratedAt: new Date(),
        },
        update: {
          schemaVersion: 1,
          status: "current",
          lastMigratedAt: new Date(),
          errorLog: null,
        },
      }),
      prisma.tenant.update({
        where: { id: tenantId },
        data: { status: "ACTIVE" },
      }),
    ]);

    console.log(`[tenant] Provisioned tenant ${tenant.slug} (${tenantId})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.tenantMigrationState.upsert({
      where: { tenantId },
      create: { tenantId, schemaVersion: 0, status: "error", errorLog: message },
      update: { status: "error", errorLog: message },
    });
    throw err;
  }
}

/**
 * Backfill tenantId on existing rows for a given tenant.
 * Used during migration of existing single-tenant data to a new tenant.
 */
export async function backfillTenantId(tenantId: string): Promise<{ tablesUpdated: string[]; totalRows: number }> {
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

  let totalRows = 0;
  const tablesUpdated: string[] = [];

  for (const table of tables) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "tenantId" = $1 WHERE "tenantId" IS NULL`,
      tenantId
    );
    if (result > 0) {
      tablesUpdated.push(`${table}: ${result}`);
      totalRows += result;
    }
  }

  return { tablesUpdated, totalRows };
}
