import type { NextFunction, Request, Response } from "express";
import { prismaUnscoped } from "../db.js";
import { normalizePublicTenantSlug } from "../lib/publicTenantSlug.js";
import { isPlatformSuperAdmin } from "../lib/workspaceRbac.js";
import { runWithTenant, type TenantContext } from "./tenantContext.js";

/**
 * Canonical workspace-plane URLs: tenant is derived from the path, not X-Tenant-Id / session alone.
 * Matches `/t/:workspaceSlug/api/...` and `/t/:workspaceSlug/mcp`.
 */
export function isCanonicalWorkspacePlanePath(path: string): boolean {
  return /^\/t\/[^/]+\/(api|mcp)(\/|$)/.test(path);
}

/**
 * After requireAuth. Resolves ACTIVE tenant from `req.params.workspaceSlug`, verifies membership
 * (or platform SUPER_ADMIN), sets `req.tenantContext`, syncs session, and runs the rest under ALS.
 */
export function resolveWorkspacePathTenant(req: Request, res: Response, next: NextFunction): void {
  const raw = req.params.workspaceSlug;
  const slug = normalizePublicTenantSlug(typeof raw === "string" ? raw : "");
  if (!slug) {
    res.status(400).json({ error: "Invalid workspace slug." });
    return;
  }

  void (async () => {
    try {
      const tenant = await prismaUnscoped.tenant.findFirst({
        where: { slug: { equals: slug, mode: "insensitive" }, status: "ACTIVE" },
        select: { id: true, slug: true, schemaName: true },
      });
      if (!tenant) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }

      const user = req.user!;
      const membership = await prismaUnscoped.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        select: { role: true },
      });

      let membershipRole: string;
      if (membership) {
        membershipRole = membership.role;
      } else if (isPlatformSuperAdmin(user.role)) {
        membershipRole = "OWNER";
      } else {
        res.status(403).json({ error: "Not a member of this workspace." });
        return;
      }

      const ctx: TenantContext = {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        schemaName: tenant.schemaName,
        membershipRole,
      };
      req.tenantContext = ctx;
      if (req.session && req.session.activeTenantId !== ctx.tenantId) {
        req.session.activeTenantId = ctx.tenantId;
      }

      runWithTenant(ctx, () => next());
    } catch (err) {
      console.error("[tenant] workspace path resolve failed:", (err as Error)?.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  })();
}
