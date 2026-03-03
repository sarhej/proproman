const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const migrationCheck = await pool.query(
      "SELECT 1 FROM _prisma_migrations WHERE migration_name = '20260303192316_rbac_audit'"
    );
    if (migrationCheck.rowCount > 0) {
      const colCheck = await pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'isActive'"
      );
      if (colCheck.rowCount === 0) {
        console.log("Migration was recorded but not applied. Removing stale record...");
        await pool.query(
          "DELETE FROM _prisma_migrations WHERE migration_name = '20260303192316_rbac_audit'"
        );
        console.log("Stale migration record removed. Prisma will re-apply it.");
      } else {
        console.log("Migration already applied correctly.");
      }
    } else {
      console.log("Migration not yet recorded. Will be applied by prisma migrate deploy.");
    }
  } catch (e) {
    console.error("Repair check failed (non-fatal):", e.message);
  } finally {
    await pool.end();
  }
})();
