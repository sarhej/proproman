import { PrismaClient } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * Tenant schema manager handles the lifecycle of per-tenant PostgreSQL schemas.
 *
 * ## Current phase (row-scoped multitenancy)
 *
 * All tenant data lives in the `public` schema with `tenantId` column filtering.
 * The schema-per-tenant infrastructure is built and ready but NOT activated yet.
 * Tenant.schemaName is recorded for each tenant but not used for routing queries.
 *
 * ## Next phase (schema-per-tenant)
 *
 * Each tenant gets its own PostgreSQL schema (e.g., `tenant_acme`).
 * Queries are routed by setting `search_path` on the connection.
 * The Prisma client extension switches schema per-request using AsyncLocalStorage.
 *
 * ## Future phase (database-per-tenant)
 *
 * High-value / regulated tenants can be moved to a dedicated database.
 * The tenant resolver returns a connection target instead of a schema name.
 * The application creates a separate PrismaClient per database.
 *
 * ## Schema naming convention
 *
 * - Control plane: `public` schema (always)
 * - Tenant schemas: `tenant_<slug>` where slug is lowercase alphanumeric + underscores
 * - Reserved: `public`, `pg_*`, `information_schema`
 */

const RESERVED_SCHEMAS = new Set(["public", "information_schema"]);

function validateSchemaName(name: string): void {
  if (RESERVED_SCHEMAS.has(name)) {
    throw new Error(`Schema name "${name}" is reserved.`);
  }
  if (name.startsWith("pg_")) {
    throw new Error(`Schema name "${name}" cannot start with pg_.`);
  }
  if (!/^tenant_[a-z0-9_]+$/.test(name)) {
    throw new Error(`Schema name "${name}" must match pattern tenant_[a-z0-9_]+.`);
  }
}

/**
 * Create a PostgreSQL schema for a tenant.
 * This is idempotent — safe to call multiple times.
 */
export async function createTenantSchema(schemaName: string): Promise<void> {
  validateSchemaName(schemaName);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  console.log(`[tenant-schema] Created schema: ${schemaName}`);
}

/**
 * Drop a tenant's PostgreSQL schema and all objects inside it.
 * DANGEROUS — only use for deprovisioning.
 */
export async function dropTenantSchema(schemaName: string): Promise<void> {
  validateSchemaName(schemaName);
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  console.log(`[tenant-schema] Dropped schema: ${schemaName}`);
}

/**
 * Check if a PostgreSQL schema exists.
 */
export async function schemaExists(schemaName: string): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) as exists`,
    schemaName
  );
  return result[0]?.exists ?? false;
}

/**
 * Get a Prisma-compatible connection string that targets a specific schema.
 * Used when creating per-schema PrismaClient instances.
 */
export function connectionStringForSchema(baseUrl: string, schemaName: string): string {
  validateSchemaName(schemaName);
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

/**
 * Create a PrismaClient that targets a specific tenant schema.
 * Used in the future schema-per-tenant phase.
 *
 * IMPORTANT: The caller is responsible for disconnecting the client when done.
 */
export function createSchemaClient(databaseUrl: string, schemaName: string): PrismaClient {
  validateSchemaName(schemaName);
  return new PrismaClient({
    datasources: {
      db: { url: connectionStringForSchema(databaseUrl, schemaName) },
    },
  });
}

/**
 * List all tenant schemas in the database.
 */
export async function listTenantSchemas(): Promise<string[]> {
  const result = await prisma.$queryRawUnsafe<{ schema_name: string }[]>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name`
  );
  return result.map((r) => r.schema_name);
}
