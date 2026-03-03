import { useMemo } from "react";
import type { User, UserRole } from "../types/models";

export type Permissions = {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  canEditStructure: boolean;
  canEditContent: boolean;
  canEditMarketing: boolean;
  canManageUsers: boolean;
  canExport: boolean;
  canCreate: boolean;
};

const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "EDITOR"];
const MARKETING_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "MARKETING"];
const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN"];

export function usePermissions(user: User | null): Permissions {
  return useMemo(() => {
    if (!user) {
      return {
        isSuperAdmin: false,
        isAdmin: false,
        canEditStructure: false,
        canEditContent: false,
        canEditMarketing: false,
        canManageUsers: false,
        canExport: false,
        canCreate: false
      };
    }
    const role = user.role;
    return {
      isSuperAdmin: role === "SUPER_ADMIN",
      isAdmin: ADMIN_ROLES.includes(role),
      canEditStructure: ADMIN_ROLES.includes(role),
      canEditContent: WRITE_ROLES.includes(role),
      canEditMarketing: MARKETING_ROLES.includes(role),
      canManageUsers: ADMIN_ROLES.includes(role),
      canExport: true,
      canCreate: ADMIN_ROLES.includes(role)
    };
  }, [user]);
}
