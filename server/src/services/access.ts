import { prisma } from "../db.js";

/**
 * Check if a user can read an entity (for notification access control).
 * Currently: all authenticated non-PENDING active users can read all entities.
 * Later: add domain/assignment restrictions when list views are restricted.
 */
export async function canRead(
  userId: string,
  _entityType: string,
  _entityId: string | null | undefined
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, role: true }
  });
  if (!user || !user.isActive || user.role === "PENDING") return false;
  return true;
}
