import type { Request } from "express";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { TenantContext } from "../tenant/tenantContext.js";

export type McpTokenVerifier = (token: string) => Promise<AuthInfo>;

/** Base or tenant-scoped Prisma client (extension keeps findUnique compatible at runtime). */
export type McpTenantPrisma = {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { activeTenantId: true };
    }): Promise<{ activeTenantId: string | null } | null>;
  };
  tenantMembership: {
    findUnique(args: {
      where: { tenantId_userId: { tenantId: string; userId: string } };
      include: { tenant: { select: { id: true; slug: true; schemaName: true; status: true } } };
    }): Promise<{
      role: string;
      tenant: { id: string; slug: string; schemaName: string; status: string };
    } | null>;
  };
};

export async function resolveMcpTenantContext(
  req: Pick<Request, "headers">,
  verifyAccessToken: McpTokenVerifier,
  prisma: McpTenantPrisma
): Promise<TenantContext | undefined> {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return undefined;

  const authInfo = await verifyAccessToken(bearer);
  const userId = authInfo.extra?.userId;
  if (typeof userId !== "string") return undefined;

  const rawHeader = req.headers["x-tenant-id"];
  const explicitTenantId =
    typeof rawHeader === "string" && rawHeader.trim() !== "" ? rawHeader.trim() : undefined;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeTenantId: true },
  });
  const tenantId = explicitTenantId ?? user?.activeTenantId ?? undefined;
  if (!tenantId) return undefined;

  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    include: {
      tenant: {
        select: { id: true, slug: true, schemaName: true, status: true },
      },
    },
  });
  if (!membership || membership.tenant.status !== "ACTIVE") return undefined;

  return {
    tenantId: membership.tenant.id,
    tenantSlug: membership.tenant.slug,
    schemaName: membership.tenant.schemaName,
    membershipRole: membership.role,
  };
}
