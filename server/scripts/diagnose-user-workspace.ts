/**
 * Print control-plane workspace state for a user (email). Use to debug
 * "Tenant context required" / missing Futureplace access.
 *
 *   cd server && npx tsx scripts/diagnose-user-workspace.ts user@example.com
 *
 * Checks: User row, activeTenantId, every TenantMembership + tenant.status.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npx tsx scripts/diagnose-user-workspace.ts <email>");
    process.exit(1);
  }

  const alias = await prisma.userEmail.findUnique({
    where: { email },
    include: { user: true },
  });
  const user = alias?.user ?? (await prisma.user.findUnique({ where: { email } }));

  if (!user) {
    console.log("No User (or alias) for email:", email);
    process.exit(0);
  }

  console.log("User:", {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    activeTenantId: user.activeTenantId,
    googleId: user.googleId ? "(set)" : null,
    microsoftId: user.microsoftId ? "(set)" : null,
  });

  const aliases = await prisma.userEmail.findMany({
    where: { userId: user.id },
    orderBy: { isPrimary: "desc" },
  });
  console.log(
    "Emails / aliases:",
    aliases.map((a) => ({ email: a.email, isPrimary: a.isPrimary }))
  );

  const memberships = await prisma.tenantMembership.findMany({
    where: { userId: user.id },
    include: { tenant: { select: { id: true, name: true, slug: true, status: true, schemaName: true } } },
    orderBy: { tenant: { name: "asc" } },
  });

  if (memberships.length === 0) {
    console.log("TenantMembership: none — user has no workspace rows.");
    process.exit(0);
  }

  console.log(
    "Memberships:",
    memberships.map((m) => ({
      role: m.role,
      tenantId: m.tenantId,
      name: m.tenant.name,
      slug: m.tenant.slug,
      status: m.tenant.status,
      schemaName: m.tenant.schemaName,
    }))
  );

  const active = memberships.filter((m) => m.tenant.status === "ACTIVE");
  const firstActive = active[0];
  console.log("First ACTIVE (resolver fallback order):", firstActive?.tenant.slug ?? "(none)");

  if (user.activeTenantId && !memberships.some((m) => m.tenantId === user.activeTenantId)) {
    console.warn("WARNING: User.activeTenantId points to a tenant with no membership (orphan id).");
  }
  if (user.activeTenantId) {
    const t = memberships.find((m) => m.tenantId === user.activeTenantId);
    if (t && t.tenant.status !== "ACTIVE") {
      console.warn(
        "WARNING: User.activeTenantId points at non-ACTIVE tenant:",
        t.tenant.slug,
        t.tenant.status
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
