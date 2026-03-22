#!/usr/bin/env node
/**
 * Railway pre-deploy: run migrations then repair.
 * Fails fast with clear errors so deploy logs show the cause.
 */
const { execSync } = require("child_process");
const path = require("path");

const schemaPath = path.join(__dirname, "../prisma/schema.prisma");

function run(label, fn) {
  const safe = String(label);
  console.log("[pre-deploy]", safe + "...");
  try {
    fn();
    console.log("[pre-deploy]", safe, "OK");
  } catch (e) {
    console.error("[pre-deploy]", safe, "FAILED:", e?.message ?? e);
    if (e.stdout) console.error(e.stdout.toString());
    if (e.stderr) console.error(e.stderr.toString());
    process.exit(1);
  }
}

if (!process.env.DATABASE_URL) {
  console.error("[pre-deploy] DATABASE_URL is not set. Add a Postgres plugin in Railway and link it to this service.");
  process.exit(1);
}

run("prisma migrate deploy", () => {
  execSync(`npx prisma migrate deploy --schema=${schemaPath}`, {
    stdio: "inherit",
    cwd: path.join(__dirname, "../.."),
  });
});

run("repair-migrations", () => {
  execSync("node server/scripts/repair-migrations.cjs", {
    stdio: "inherit",
    cwd: path.join(__dirname, "../.."),
  });
});
