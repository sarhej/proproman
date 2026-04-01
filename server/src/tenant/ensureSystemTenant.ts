import { prisma } from "../db.js";
import { env } from "../env.js";
import { slugToSchemaName } from "./tenantSlug.js";
import { provisionTenant } from "./tenantProvisioning.js";

/**
 * Ensures exactly one active system (Tymio product) workspace exists.
 * Safe to call on every server startup (idempotent).
 */
export async function ensureSystemTenant(): Promise<void> {
  const slug = env.TYMI_SYSTEM_TENANT_SLUG.toLowerCase();
  const schemaName = slugToSchemaName(slug);

  const existingSystem = await prisma.tenant.findFirst({ where: { isSystem: true } });
  if (existingSystem) {
    return;
  }

  const bySlug = await prisma.tenant.findUnique({ where: { slug } });
  if (bySlug) {
    await prisma.tenant.update({
      where: { id: bySlug.id },
      data: { isSystem: true, name: bySlug.name.startsWith("Tymio") ? bySlug.name : `Tymio (${bySlug.name})` },
    });
    if (bySlug.status === "PROVISIONING") {
      try {
        await provisionTenant(bySlug.id);
      } catch (e) {
        console.error("[tenant] ensureSystemTenant: provision failed for existing slug", e);
      }
    }
    return;
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: "Tymio",
      slug,
      schemaName,
      isSystem: true,
      status: "PROVISIONING",
      migrationState: { create: { schemaVersion: 0, status: "pending" } },
    },
  });

  try {
    await provisionTenant(tenant.id);
  } catch (e) {
    console.error("[tenant] ensureSystemTenant: provision failed for new system tenant", e);
  }
}
