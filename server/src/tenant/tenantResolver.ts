import { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { runWithTenant, TenantContext } from "./tenantContext.js";

async function tryResolveActiveTenant(
  userId: string,
  tenantId: string
): Promise<TenantContext | null> {
  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    include: { tenant: { select: { id: true, slug: true, schemaName: true, status: true } } },
  });
  if (!membership || membership.tenant.status !== "ACTIVE") {
    return null;
  }
  return {
    tenantId: membership.tenant.id,
    tenantSlug: membership.tenant.slug,
    schemaName: membership.tenant.schemaName,
    membershipRole: membership.role,
  };
}

/** When session / User.activeTenantId are missing or invalid, pick first ACTIVE membership (same sort as GET /me/tenants). */
async function firstActiveMembershipContext(userId: string): Promise<TenantContext | null> {
  const rows = await prisma.tenantMembership.findMany({
    where: { userId },
    include: { tenant: { select: { id: true, slug: true, schemaName: true, status: true } } },
    orderBy: { tenant: { name: "asc" } },
  });
  const m = rows.find((r) => r.tenant.status === "ACTIVE");
  if (!m) return null;
  return {
    tenantId: m.tenant.id,
    tenantSlug: m.tenant.slug,
    schemaName: m.tenant.schemaName,
    membershipRole: m.role,
  };
}

/**
 * Resolve tenant from:
 *   1. X-Tenant-Id header (explicit) — tried alone; no fallback if invalid (caller chose a workspace).
 *   2. Otherwise, in order: req.session.activeTenantId, req.user.activeTenantId — try each until one
 *      is an ACTIVE membership. This heals stale sessions (e.g. session still points at a removed
 *      workspace while the DB default was updated) so /api/auth/me and /api/meta stay consistent.
 *   3. If those fail, use the first ACTIVE workspace the user belongs to (by tenant name) and
 *      persist User.activeTenantId when it was wrong or null — fixes accounts stuck with no context
 *      despite a valid membership (e.g. Futureplace).
 *
 * When a tenant is resolved, session.activeTenantId is updated to match so the next request agrees.
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

  try {
    let ctx: TenantContext | null = null;

    if (fromHeader) {
      ctx = await tryResolveActiveTenant(user.id, fromHeader);
    } else {
      const seen = new Set<string>();
      const candidates: string[] = [];
      const sessionId =
        typeof req.session?.activeTenantId === "string" && req.session.activeTenantId.trim() !== ""
          ? req.session.activeTenantId.trim()
          : undefined;
      const persistedTenantId =
        typeof user.activeTenantId === "string" && user.activeTenantId.trim() !== ""
          ? user.activeTenantId.trim()
          : undefined;
      for (const id of [sessionId, persistedTenantId]) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        candidates.push(id);
      }
      for (const tenantId of candidates) {
        ctx = await tryResolveActiveTenant(user.id, tenantId);
        if (ctx) break;
      }

      if (!ctx) {
        ctx = await firstActiveMembershipContext(user.id);
        if (ctx && user.activeTenantId !== ctx.tenantId) {
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: { activeTenantId: ctx.tenantId },
            });
            user.activeTenantId = ctx.tenantId;
            console.warn("[tenant] repaired User.activeTenantId from first ACTIVE membership", {
              userId: user.id,
              tenantSlug: ctx.tenantSlug,
            });
          } catch (repairErr) {
            console.error("[tenant] failed to persist activeTenantId repair:", (repairErr as Error)?.message);
          }
        }
      }
    }

    if (!ctx) {
      next();
      return;
    }

    req.tenantContext = ctx;
    if (req.session && req.session.activeTenantId !== ctx.tenantId) {
      req.session.activeTenantId = ctx.tenantId;
    }

    runWithTenant(ctx, () => next());
  } catch (err) {
    console.error("[tenant] Failed to resolve tenant:", (err as Error)?.message);
    next();
  }
}
