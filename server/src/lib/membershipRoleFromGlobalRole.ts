import { MembershipRole, UserRole } from "@prisma/client";

/** Maps global `UserRole` to workspace `MembershipRole` when inviting or adding members. */
export function membershipRoleForInvitedGlobalRole(role: UserRole): MembershipRole {
  switch (role) {
    case UserRole.SUPER_ADMIN:
    case UserRole.ADMIN:
      return MembershipRole.ADMIN;
    case UserRole.EDITOR:
    case UserRole.MARKETING:
      return MembershipRole.MEMBER;
    case UserRole.VIEWER:
    case UserRole.PENDING:
      return MembershipRole.VIEWER;
    default:
      return MembershipRole.MEMBER;
  }
}
