import { UserRole } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * Most routes use `requireAuth`, which rejects platform `PENDING`. Workspace list/switch is on
 * `meSessionRouter`, but invite acceptance still promotes to `VIEWER` and sets `activeTenantId`
 * so the rest of the app works without a separate approval step.
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
