import { User as PrismaUser, UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface User extends PrismaUser {}
  }
}

export type AppUserRole = UserRole;
