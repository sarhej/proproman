import { User as PrismaUser, UserRole } from "@prisma/client";
import { TenantContext } from "../tenant/tenantContext.js";

declare global {
  namespace Express {
    interface User extends PrismaUser {}
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}

declare module "express-session" {
  interface SessionData {
    activeTenantId?: string;
    /** Slug of tenant the user was trying to access before OAuth redirect */
    pendingTenantSlug?: string;
  }
}

export type AppUserRole = UserRole;
