import { MembershipRole, UserRole } from "@prisma/client";
import type { ExtendedPrismaClient } from "../db.js";

/** Matches the extended Prisma client `$transaction` callback parameter. */
type Tx = Parameters<Parameters<ExtendedPrismaClient["$transaction"]>[0]>[0];
function displayNameFromEmailLocalPart(email: string): string {
  const local = email.split("@")[0] ?? "User";
  const cleaned = local.replace(/[._]+/g, " ").trim();
  if (!cleaned) return "User";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

async function findUserByPrimaryOrAlias(tx: Tx, emailNorm: string) {
  const alias = await tx.userEmail.findUnique({
    where: { email: emailNorm },
    include: { user: true },
  });
  if (alias?.user) return alias.user;
  return tx.user.findUnique({ where: { email: emailNorm } });
}

/**
 * Ensures a workspace MEMBER exists for the email (creates VIEWER user + membership if needed).
 * Skips if email equals contactEmail (caller should filter).
 */
export async function provisionInviteeMemberForTenant(
  tx: Tx,
  input: { email: string; tenantId: string }
): Promise<{ userId: string; created: boolean }> {
  const emailNorm = input.email.trim().toLowerCase();
  const existing = await findUserByPrimaryOrAlias(tx, emailNorm);
  if (existing) {
    await tx.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: existing.id } },
      create: {
        tenantId: input.tenantId,
        userId: existing.id,
        role: MembershipRole.MEMBER,
      },
      update: {},
    });
    return { userId: existing.id, created: false };
  }

  const user = await tx.user.create({
    data: {
      email: emailNorm,
      name: displayNameFromEmailLocalPart(emailNorm),
      role: UserRole.VIEWER,
      activeTenantId: input.tenantId,
      emails: { create: { email: emailNorm, isPrimary: true } },
    },
  });
  await tx.tenantMembership.create({
    data: {
      tenantId: input.tenantId,
      userId: user.id,
      role: MembershipRole.MEMBER,
    },
  });
  return { userId: user.id, created: true };
}

