import { useMemo } from "react";
import type { User, UserRole } from "../types/models";
import { getRoleCode } from "../types/models";

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
    const role = getRoleCode(user);
    if (!user || !role) {
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
    return {
      isSuperAdmin: role === "SUPER_ADMIN",
      isAdmin: ADMIN_ROLES.includes(role as UserRole),
      canEditStructure: ADMIN_ROLES.includes(role as UserRole),
      canEditContent: WRITE_ROLES.includes(role as UserRole),
      canEditMarketing: MARKETING_ROLES.includes(role as UserRole),
      canManageUsers: ADMIN_ROLES.includes(role as UserRole),
      canExport: true,
      canCreate: ADMIN_ROLES.includes(role as UserRole)
    };
  }, [user]);
}
