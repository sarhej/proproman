import { NextFunction, Request, Response } from "express";

/**
 * Guard middleware that rejects requests without a resolved tenant context.
 * Place after tenantResolver and requireAuth on tenant-scoped routes.
 */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenantContext) {
    res.status(400).json({ error: "Tenant context required. Set X-Tenant-Id header or select a workspace." });
    return;
  }
  next();
}

/**
 * Extract tenantId from the request. Throws if no tenant is set.
 * Use inside route handlers that are guarded by requireTenant.
 */
export function getTenantId(req: Request): string {
  if (!req.tenantContext) {
    throw new Error("No tenant context on request — requireTenant middleware missing?");
  }
  return req.tenantContext.tenantId;
}
