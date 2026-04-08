/**
 * One-off / maintenance: platform PENDING users cannot call /api/me/tenants.
 * If they already have a workspace membership (invited), promote to VIEWER and set activeTenantId when null.
 *
 *   cd server && npx tsx scripts/promote-pending-users-with-workspace-membership.ts
 *
 * Production: DATABASE_URL to prod DB, or Railway shell.
 */
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const pending = await prisma.user.findMany({
    where: { role: UserRole.PENDING },
    select: { id: true, email: true, activeTenantId: true },
  });
  let updated = 0;
  for (const u of pending) {
    const m = await prisma.tenantMembership.findFirst({
      where: { userId: u.id },
      orderBy: { createdAt: "asc" },
      select: { tenantId: true },
    });
    if (!m) continue;
    await prisma.user.update({
      where: { id: u.id },
      data: {
        role: UserRole.VIEWER,
        activeTenantId: u.activeTenantId ?? m.tenantId,
      },
    });
    console.log(`Updated ${u.email} → VIEWER, activeTenantId set`);
    updated += 1;
  }
  console.log(`Done. Updated ${updated} user(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
