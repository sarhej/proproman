/**
 * One-off recovery: set a user's global role to SUPER_ADMIN (e.g. after accidental demotion).
 *
 * Requires DATABASE_URL (same as Prisma). Run from repo server workspace:
 *
 *   cd server && npx tsx scripts/promote-super-admin.ts you@example.com
 *
 * Production (Railway): point DATABASE_URL at prod, or run inside the service environment.
 */
import { PrismaClient, UserRole } from "@prisma/client";

const emailArg = process.argv[2]?.trim().toLowerCase();
if (!emailArg) {
  console.error("Usage: npx tsx scripts/promote-super-admin.ts <email>");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: emailArg }, { emails: { some: { email: emailArg } } }],
    },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    console.error(`No user found for email (primary or alias): ${emailArg}`);
    process.exit(1);
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    console.log(`Already SUPER_ADMIN: ${user.name} <${user.email}>`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: UserRole.SUPER_ADMIN },
  });

  console.log(`OK — promoted to SUPER_ADMIN: ${user.name} <${user.email}> (was ${user.role})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
