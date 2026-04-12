import type { Request } from "express";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { prismaUnscoped } from "../db.js";
import { normalizePublicTenantSlug } from "../lib/publicTenantSlug.js";
import { isPlatformSuperAdmin } from "../lib/workspaceRbac.js";
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

/**
 * Workspace-canonical MCP: tenant comes from URL `/t/:workspaceSlug/mcp`, not X-Tenant-Id.
 */
export async function resolveMcpTenantContextFromWorkspaceSlug(
  req: Pick<Request, "headers">,
  workspaceSlugParam: string,
  verifyAccessToken: McpTokenVerifier
): Promise<TenantContext | undefined> {
  const slug = normalizePublicTenantSlug(workspaceSlugParam);
  if (!slug) return undefined;

  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return undefined;

  const authInfo = await verifyAccessToken(bearer);
  const userId = authInfo.extra?.userId;
  if (typeof userId !== "string") return undefined;

  const tenant = await prismaUnscoped.tenant.findFirst({
    where: { slug: { equals: slug, mode: "insensitive" }, status: "ACTIVE" },
    select: { id: true, slug: true, schemaName: true },
  });
  if (!tenant) return undefined;

  const user = await prismaUnscoped.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return undefined;

  const membership = await prismaUnscoped.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId } },
    include: {
      tenant: { select: { id: true, slug: true, schemaName: true, status: true } },
    },
  });

  if (membership && membership.tenant.status === "ACTIVE") {
    return {
      tenantId: membership.tenant.id,
      tenantSlug: membership.tenant.slug,
      schemaName: membership.tenant.schemaName,
      membershipRole: membership.role,
    };
  }

  if (isPlatformSuperAdmin(user.role)) {
    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      schemaName: tenant.schemaName,
      membershipRole: "OWNER",
    };
  }

  return undefined;
}
