import { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { checkAuth } from "./auth.js";
import {
  isPlatformSuperAdmin,
  workspaceMembershipCanManageStructure,
  workspaceMembershipCanWriteContent,
} from "../lib/workspaceRbac.js";

/**
 * Content writes in a workspace (initiatives, features, requirements, comments, etc.).
 * SUPER_ADMIN bypasses; otherwise requires resolved tenant context and OWNER | ADMIN | MEMBER.
 */
export function requireWorkspaceContentWrite() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!checkAuth(req, res)) return;
    if (isPlatformSuperAdmin(req.user!.role)) {
      next();
      return;
    }
    if (!req.tenantContext) {
      res.status(400).json({ error: "Tenant context required. Set X-Tenant-Id header or select a workspace." });
      return;
    }
    if (!workspaceMembershipCanWriteContent(req.tenantContext.membershipRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/**
 * Structure / admin operations within a workspace (products, domains, revenue streams, initiative delete, etc.).
 * SUPER_ADMIN bypasses; otherwise requires OWNER | ADMIN membership in the active workspace.
 */
export function requireWorkspaceStructureWrite() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!checkAuth(req, res)) return;
    if (isPlatformSuperAdmin(req.user!.role)) {
      next();
      return;
    }
    if (!req.tenantContext) {
      res.status(400).json({ error: "Tenant context required. Set X-Tenant-Id header or select a workspace." });
      return;
    }
    if (!workspaceMembershipCanManageStructure(req.tenantContext.membershipRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/**
 * Campaign / asset / link mutations: workspace must allow writes, and the user keeps a global marketing/admin hat.
 */
export function requireTenantCampaignWrite() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!checkAuth(req, res)) return;
    if (isPlatformSuperAdmin(req.user!.role)) {
      next();
      return;
    }
    if (!req.tenantContext) {
      res.status(400).json({ error: "Tenant context required. Set X-Tenant-Id header or select a workspace." });
      return;
    }
    if (!workspaceMembershipCanWriteContent(req.tenantContext.membershipRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const r = req.user!.role;
    if (r === UserRole.ADMIN || r === UserRole.MARKETING) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden" });
  };
}
