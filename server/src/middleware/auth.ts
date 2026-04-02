import { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";

export function checkAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!req.user.isActive) {
    res.status(403).json({ error: "Account deactivated" });
    return false;
  }
  if (req.user.role === UserRole.PENDING) {
    res.status(403).json({ error: "PENDING_APPROVAL" });
    return false;
  }
  return true;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (checkAuth(req, res)) next();
}

/** Logged-in + active account only (allows `UserRole.PENDING`). For endpoints that must work before platform role promotion. */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.user.isActive) {
    res.status(403).json({ error: "Account deactivated" });
    return;
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!checkAuth(req, res)) return;
    if (req.user!.role === UserRole.SUPER_ADMIN || roles.includes(req.user!.role)) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden" });
  };
}

export function requireWriteAccess() {
  return requireRole(UserRole.ADMIN, UserRole.EDITOR);
}

export function requireMarketingAccess() {
  return requireRole(UserRole.ADMIN, UserRole.MARKETING);
}
