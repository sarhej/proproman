import { MembershipRole, UserRole } from "@prisma/client";

/** Any workspace member may read tenant-scoped data (including VIEWER). */
export function workspaceMembershipCanRead(membershipRole: string): boolean {
  return (
    membershipRole === MembershipRole.OWNER ||
    membershipRole === MembershipRole.ADMIN ||
    membershipRole === MembershipRole.MEMBER ||
    membershipRole === MembershipRole.VIEWER
  );
}

/** OWNER / ADMIN / MEMBER may edit initiatives, features, requirements, etc. VIEWER cannot. */
export function workspaceMembershipCanWriteContent(membershipRole: string): boolean {
  return (
    membershipRole === MembershipRole.OWNER ||
    membershipRole === MembershipRole.ADMIN ||
    membershipRole === MembershipRole.MEMBER
  );
}

/** OWNER / ADMIN may manage workspace structure: products, domains, delete initiatives, assignments admin, import/export policy, etc. */
export function workspaceMembershipCanManageStructure(membershipRole: string): boolean {
  return membershipRole === MembershipRole.OWNER || membershipRole === MembershipRole.ADMIN;
}

export function isPlatformSuperAdmin(globalRole: UserRole | string): boolean {
  return globalRole === UserRole.SUPER_ADMIN;
}
