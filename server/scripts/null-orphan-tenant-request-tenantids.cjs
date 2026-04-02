#!/usr/bin/env node
/**
 * Before applying TenantRequest_tenantId_fkey, clear tenantId values that point at
 * deleted/missing Tenant rows. Idempotent; safe to run on every deploy.
 * Without this, `prisma migrate deploy` fails with Postgres 23503 on Railway.
 */
const { Pool } = require("pg");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.log("[null-orphan-tenant-request-ids] DATABASE_URL not set; skip.");
    process.exit(0);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const tr = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'TenantRequest'"
    );
    const tt = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Tenant'"
    );
    if (tr.rowCount === 0 || tt.rowCount === 0) {
      console.log("[null-orphan-tenant-request-ids] TenantRequest or Tenant missing; skip.");
      process.exit(0);
    }

    const { rowCount } = await pool.query(`
      UPDATE "TenantRequest" AS tr
      SET "tenantId" = NULL
      WHERE tr."tenantId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "Tenant" AS t WHERE t.id = tr."tenantId")
    `);

    console.log(
      "[null-orphan-tenant-request-ids] Cleared orphan tenantId on",
      rowCount ?? 0,
      "row(s)."
    );
  } catch (e) {
    console.error("[null-orphan-tenant-request-ids] FAILED:", e.message || e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
