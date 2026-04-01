import { prisma } from "../db.js";

/**
 * Returns the first user id that is not an active member of the tenant, or null if all are members (or list empty).
 */
export async function findFirstUserIdNotInTenant(
  tenantId: string,
  userIds: (string | null | undefined)[]
): Promise<string | null> {
  const ids = [...new Set(userIds.filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (ids.length === 0) return null;
  const rows = await prisma.tenantMembership.findMany({
    where: { tenantId, userId: { in: ids } },
    select: { userId: true },
  });
  const ok = new Set(rows.map((r) => r.userId));
  for (const id of ids) {
    if (!ok.has(id)) return id;
  }
  return null;
}

/** Load public user rows for all members of a tenant (for meta / pickers). */
export async function listTenantMemberUsersPublic(tenantId: string): Promise<
  { id: string; name: string | null; email: string; role: string }[]
> {
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  return memberships.map((m) => m.user);
}
