import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { processNotificationForAuditEntry } from "./notification-delivery.js";

export async function logAudit(
  userId: string,
  action: AuditAction | `${AuditAction}`,
  entityType: string,
  entityId?: string | null,
  details?: object | null
): Promise<void> {
  try {
    const entry = await prisma.auditEntry.create({
      data: {
        userId,
        action: action as AuditAction,
        entityType,
        entityId: entityId ?? undefined,
        details: details ? (details as Prisma.InputJsonValue) : Prisma.JsonNull
      }
    });
    void processNotificationForAuditEntry(entry.id, env.CLIENT_URL).catch((err) =>
      console.error("[notification] processNotificationForAuditEntry failed:", err)
    );
  } catch {
    console.error("[audit] Failed to write audit entry:", action, entityType, entityId);
  }
}
