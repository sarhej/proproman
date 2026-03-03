import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export async function logAudit(
  userId: string,
  action: AuditAction | `${AuditAction}`,
  entityType: string,
  entityId?: string | null,
  details?: object | null
): Promise<void> {
  try {
    await prisma.auditEntry.create({
      data: {
        userId,
        action: action as AuditAction,
        entityType,
        entityId: entityId ?? undefined,
        details: details ? (details as Prisma.InputJsonValue) : Prisma.JsonNull
      }
    });
  } catch {
    console.error("[audit] Failed to write audit entry:", action, entityType, entityId);
  }
}
