import { prismaUnscoped } from "../db.js";

/** Mark join requests fulfilled when the user becomes a workspace member. */
export async function fulfillWorkspaceAccessRequestsForMembership(
  tenantId: string,
  userId: string
): Promise<void> {
  await prismaUnscoped.workspaceAccessRequest.updateMany({
    where: { tenantId, userId, status: "PENDING" },
    data: { status: "FULFILLED" },
  });
}
