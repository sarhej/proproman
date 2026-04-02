import { MembershipRole } from "@prisma/client";
import { prisma } from "../db.js";
import { parseTenantEnabledLocales, type AppLocaleCode } from "./appLocales.js";

export type ActiveTenantPayload = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isSystem: boolean;
  enabledLocales: AppLocaleCode[];
  membershipRole: MembershipRole;
};

/**
 * Only returns workspace metadata when the user still has membership and the tenant is ACTIVE.
 * Use for /api/auth/me (and similar) so stale `activeTenantId` cannot leak tenant details.
 */
export async function resolveActiveTenantForAuthenticatedUser(
  userId: string,
  candidateTenantId: string | null | undefined
): Promise<ActiveTenantPayload | null> {
  if (!candidateTenantId) return null;
  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: candidateTenantId, userId } },
    include: {
      tenant: { select: { id: true, name: true, slug: true, status: true, isSystem: true, settings: true } },
    },
  });
  if (!membership || membership.tenant.status !== "ACTIVE") return null;
  const { settings, ...tenant } = membership.tenant;
  return {
    ...tenant,
    enabledLocales: parseTenantEnabledLocales(settings),
    membershipRole: membership.role,
  };
}
