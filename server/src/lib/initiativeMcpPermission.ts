import { prisma } from "../db.js";
import {
  isPlatformSuperAdmin,
  workspaceMembershipCanManageStructure,
  workspaceMembershipCanWriteContent
} from "./workspaceRbac.js";

/**
 * Mirrors HTTP canUserEditInitiative (initiatives router) for MCP tools.
 */
export async function canUserEditInitiativeForMcp(
  userId: string,
  globalRole: string,
  membershipRole: string,
  initiativeId: string
): Promise<boolean> {
  if (isPlatformSuperAdmin(globalRole)) return true;
  if (workspaceMembershipCanManageStructure(membershipRole)) return true;
  if (!workspaceMembershipCanWriteContent(membershipRole)) return false;
  const initiative = await prisma.initiative.findUnique({
    where: { id: initiativeId },
    select: { ownerId: true, assignments: { select: { userId: true } } }
  });
  if (!initiative) return false;
  if (initiative.ownerId === userId) return true;
  if (initiative.assignments.some((a) => a.userId === userId)) return true;
  return false;
}
