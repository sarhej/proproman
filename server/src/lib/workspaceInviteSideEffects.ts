import { UserRole } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * Platform `PENDING` users are rejected by `requireAuth` (e.g. GET /api/me/tenants, POST switch).
 * Adding them to a workspace is an explicit invite — grant minimum app access and default workspace.
 */
export async function applyWorkspaceInviteSideEffects(userId: string, tenantId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, activeTenantId: true },
  });
  if (!user) return;

  const data: { role?: UserRole; activeTenantId?: string } = {};
  if (user.role === UserRole.PENDING) {
    data.role = UserRole.VIEWER;
  }
  if (user.activeTenantId == null) {
    data.activeTenantId = tenantId;
  }
  if (Object.keys(data).length === 0) return;

  await prisma.user.update({
    where: { id: userId },
    data,
  });
}
