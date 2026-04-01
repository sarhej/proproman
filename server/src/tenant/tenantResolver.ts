import { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { runWithTenant, TenantContext } from "./tenantContext.js";

/**
 * Resolve tenant from:
 *   1. X-Tenant-Id header (explicit, e.g. API clients)
 *   2. req.session.activeTenantId (browser sessions)
 *   3. req.user.activeTenantId (persisted default)
 *
 * After resolution, validates membership and wraps the rest of the
 * request in an AsyncLocalStorage context carrying TenantContext.
 *
 * If no tenant can be resolved the request continues without tenant context.
 * Routes that require it should use requireTenant middleware.
 */
export async function tenantResolver(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.user;
  if (!user) {
    next();
    return;
  }

  const rawHeader = req.headers["x-tenant-id"];
  const fromHeader =
    typeof rawHeader === "string" && rawHeader.trim() !== "" ? rawHeader.trim() : undefined;
  const tenantId =
    fromHeader ?? req.session?.activeTenantId ?? user.activeTenantId ?? undefined;

  if (!tenantId) {
    next();
    return;
  }

  try {
    const membership = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
      include: { tenant: { select: { id: true, slug: true, schemaName: true, status: true } } },
    });

    if (!membership || membership.tenant.status !== "ACTIVE") {
      next();
      return;
    }

    const ctx: TenantContext = {
      tenantId: membership.tenant.id,
      tenantSlug: membership.tenant.slug,
      schemaName: membership.tenant.schemaName,
      membershipRole: membership.role,
    };

    req.tenantContext = ctx;

    runWithTenant(ctx, () => next());
  } catch (err) {
    console.error("[tenant] Failed to resolve tenant:", (err as Error)?.message);
    next();
  }
}
