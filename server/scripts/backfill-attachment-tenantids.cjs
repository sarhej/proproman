#!/usr/bin/env node
/**
 * Repair Attachment / AttachmentLink rows created while multer dropped tenant ALS
 * (tenantId left NULL). Derives tenant from storageKey `tenants/<id>/attachments/...`
 * and copies attachment.tenantId onto orphan links.
 *
 * Idempotent. Safe to run on every deploy when DATABASE_URL is set.
 * Usage: node server/scripts/backfill-attachment-tenantids.cjs
 */
const { Pool } = require("pg");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.log("[backfill-attachment-tenantids] DATABASE_URL not set; skip.");
    process.exit(0);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const att = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Attachment'"
    );
    if (att.rowCount === 0) {
      console.log("[backfill-attachment-tenantids] Attachment table missing; skip.");
      process.exit(0);
    }

    const fromKey = await pool.query(`
      UPDATE "Attachment"
      SET "tenantId" = substring("storageKey" from '^tenants/([^/]+)/attachments/')
      WHERE "tenantId" IS NULL
        AND "storageKey" ~ '^tenants/[^/]+/attachments/'
        AND EXISTS (
          SELECT 1 FROM "Tenant" t
          WHERE t.id = substring("Attachment"."storageKey" from '^tenants/([^/]+)/attachments/')
        )
    `);

    const fromParent = await pool.query(`
      UPDATE "Attachment" AS child
      SET "tenantId" = parent."tenantId"
      FROM "Attachment" AS parent
      WHERE child."tenantId" IS NULL
        AND child."parentAttachmentId" = parent.id
        AND parent."tenantId" IS NOT NULL
    `);

    const links = await pool.query(`
      UPDATE "AttachmentLink" AS l
      SET "tenantId" = a."tenantId"
      FROM "Attachment" AS a
      WHERE l."attachmentId" = a.id
        AND l."tenantId" IS NULL
        AND a."tenantId" IS NOT NULL
    `);

    console.log(
      "[backfill-attachment-tenantids] attachments from storageKey:",
      fromKey.rowCount ?? 0,
      "; from parent:",
      fromParent.rowCount ?? 0,
      "; links:",
      links.rowCount ?? 0
    );
  } catch (e) {
    console.error("[backfill-attachment-tenantids] FAILED:", e.message || e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
