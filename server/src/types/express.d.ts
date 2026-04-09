import { User as PrismaUser, UserRole } from "@prisma/client";
import { TenantContext } from "../tenant/tenantContext.js";

declare global {
  namespace Express {
    interface User extends PrismaUser {}
    interface Request {
      tenantContext?: TenantContext;
      /** Set when `Authorization: Bearer` matches deployment `API_KEY` (stateless automation). */
      authViaApiKey?: boolean;
    }
  }
}

declare module "express-session" {
  interface SessionData {
    activeTenantId?: string;
    /** Slug of tenant the user was trying to access before OAuth redirect */
    pendingTenantSlug?: string;
    /** Allowlisted client path to open after OAuth (e.g. /register-workspace). */
    pendingPostLoginPath?: string;
  }
}

export type AppUserRole = UserRole;
