import { AuditAction, NotificationRecipientKind, NotificationScope } from "@prisma/client";
import { prisma } from "../db.js";
import { canRead } from "./access.js";

export type AuditEntryForNotify = {
  id: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
};

/** Get list of userId to notify for this audit entry, after canRead filter. */
export async function getRecipientsForEntry(entry: AuditEntryForNotify): Promise<string[]> {
  const rules = await prisma.notificationRule.findMany({
    where: {
      action: entry.action,
      entityType: entry.entityType,
      enabled: true
    }
  });

  const details = entry.details ?? {};
  let initiativeId: string | null = (details.initiativeId as string) ?? null;
  let domainId: string | null = (details.domainId as string) ?? null;
  if (entry.entityType === "INITIATIVE" && entry.entityId) initiativeId = entry.entityId;

  if (!domainId && initiativeId) {
    const init = await prisma.initiative.findUnique({
      where: { id: initiativeId },
      select: { domainId: true }
    });
    if (init) domainId = init.domainId;
  }

  const userIds = new Set<string>();

  for (const rule of rules) {
    if (rule.recipientKind === NotificationRecipientKind.GLOBAL_ROLE && rule.recipientRole) {
      const users = await prisma.user.findMany({
        where: { role: rule.recipientRole as "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "MARKETING" | "VIEWER" | "PENDING", isActive: true }
      });
      users.forEach((u) => userIds.add(u.id));
      continue;
    }
    if (rule.recipientKind === NotificationRecipientKind.OBJECT_OWNER && initiativeId) {
      const init = await prisma.initiative.findUnique({
        where: { id: initiativeId },
        select: { ownerId: true }
      });
      if (init?.ownerId) userIds.add(init.ownerId);
      continue;
    }
    if (rule.recipientKind === NotificationRecipientKind.OBJECT_ASSIGNEE && initiativeId) {
      const assignments = await prisma.initiativeAssignment.findMany({
        where: { initiativeId },
        select: { userId: true }
      });
      assignments.forEach((a) => userIds.add(a.userId));
      continue;
    }
    if (rule.recipientKind === NotificationRecipientKind.OBJECT_ROLE && initiativeId && rule.recipientRole) {
      const assignments = await prisma.initiativeAssignment.findMany({
        where: { initiativeId, role: rule.recipientRole as "ACCOUNTABLE" | "IMPLEMENTER" | "CONSULTED" | "INFORMED" },
        select: { userId: true }
      });
      assignments.forEach((a) => userIds.add(a.userId));
    }
  }

  const subs = await prisma.userNotificationSubscription.findMany({
    where: {
      action: entry.action,
      entityType: entry.entityType,
      OR: [
        { scopeType: NotificationScope.GLOBAL, scopeId: null },
        ...(domainId ? [{ scopeType: NotificationScope.DOMAIN, scopeId: domainId }] : []),
        ...(initiativeId ? [{ scopeType: NotificationScope.INITIATIVE, scopeId: initiativeId }] : [])
      ]
    },
    select: { userId: true }
  });
  subs.forEach((s) => userIds.add(s.userId));

  // Always include the actor so the person who performed the action gets an in-app notification (e.g. "You created initiative X")
  userIds.add(entry.userId);

  const filtered: string[] = [];
  for (const uid of userIds) {
    const ok = await canRead(uid, entry.entityType, entry.entityId);
    if (ok) filtered.push(uid);
  }
  return filtered;
}
