const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    // Check if the isActive column exists
    const colCheck = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'isActive'"
    );

    if (colCheck.rowCount === 0) {
      console.log("isActive column missing. Applying RBAC migration directly...");

      // Create AuditAction enum if not exists
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditAction') THEN
            CREATE TYPE "AuditAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'STATUS_CHANGED', 'ROLE_CHANGED', 'LOGIN');
          END IF;
        END $$;
      `);

      // Add enum values safely (outside transaction via DO block workaround)
      const existingValues = await pool.query(
        "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'UserRole'"
      );
      const existing = existingValues.rows.map(r => r.enumlabel);
      
      for (const val of ['SUPER_ADMIN', 'EDITOR', 'MARKETING']) {
        if (!existing.includes(val)) {
          await pool.query(`ALTER TYPE "UserRole" ADD VALUE '${val}'`);
          console.log(`Added enum value: ${val}`);
        }
      }

      // Add columns
      await pool.query(`
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
      `);

      // Create AuditEntry table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "AuditEntry" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "action" "AuditAction" NOT NULL,
          "entityType" TEXT NOT NULL,
          "entityId" TEXT,
          "details" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "AuditEntry_userId_idx" ON "AuditEntry"("userId");
        CREATE INDEX IF NOT EXISTS "AuditEntry_entityType_entityId_idx" ON "AuditEntry"("entityType", "entityId");
        CREATE INDEX IF NOT EXISTS "AuditEntry_createdAt_idx" ON "AuditEntry"("createdAt");
      `);

      // Add FK if not exists
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditEntry_userId_fkey') THEN
            ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_userId_fkey"
              FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `);

      // Mark migration as applied so prisma doesn't try again
      await pool.query(`
        INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
        VALUES (gen_random_uuid(), 'manual-repair', '20260303192316_rbac_audit', NOW(), 1)
        ON CONFLICT DO NOTHING;
      `);

      console.log("RBAC migration applied successfully via direct SQL.");
    } else {
      console.log("isActive column exists. No repair needed.");
    }
  } catch (e) {
    console.error("Repair failed:", e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
