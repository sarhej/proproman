import {
  AuditAction,
  DeliveryChannel,
  NotificationRecipientKind,
  NotificationScope,
} from "@prisma/client";
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

const VALID_CHANNELS: readonly DeliveryChannel[] = ["IN_APP", "EMAIL", "SLACK", "WHATSAPP"];

/** Normalize JSON from NotificationRule / UserNotificationSubscription.deliveryChannels. */
export function parseRuleDeliveryChannels(json: unknown): DeliveryChannel[] {
  if (!Array.isArray(json) || json.length === 0) return ["IN_APP"];
  const out: DeliveryChannel[] = [];
  for (const x of json) {
    if (typeof x === "string" && (VALID_CHANNELS as readonly string[]).includes(x)) {
      out.push(x as DeliveryChannel);
    }
  }
  return out.length > 0 ? out : ["IN_APP"];
}

/** When rule.eventKind is set, require details.eventKind to match; otherwise rule applies. */
export function notificationRuleMatchesEventKind(
  ruleEventKind: string | null,
  details: Record<string, unknown>
): boolean {
  if (ruleEventKind == null || ruleEventKind === "") return true;
  const k = details.eventKind;
  return typeof k === "string" && k === ruleEventKind;
}

async function resolveRuleRecipientUserIds(
  rule: {
    recipientKind: NotificationRecipientKind;
    recipientRole: string | null;
  },
  initiativeId: string | null
): Promise<string[]> {
  if (rule.recipientKind === NotificationRecipientKind.GLOBAL_ROLE && rule.recipientRole) {
    const users = await prisma.user.findMany({
      where: {
        role: rule.recipientRole as
          | "SUPER_ADMIN"
          | "ADMIN"
          | "EDITOR"
          | "MARKETING"
          | "VIEWER"
          | "PENDING",
        isActive: true
      },
      select: { id: true }
    });
    return users.map((u) => u.id);
  }
  if (rule.recipientKind === NotificationRecipientKind.OBJECT_OWNER && initiativeId) {
    const init = await prisma.initiative.findUnique({
      where: { id: initiativeId },
      select: { ownerId: true }
    });
    return init?.ownerId ? [init.ownerId] : [];
  }
  if (rule.recipientKind === NotificationRecipientKind.OBJECT_ASSIGNEE && initiativeId) {
    const assignments = await prisma.initiativeAssignment.findMany({
      where: { initiativeId },
      select: { userId: true }
    });
    return assignments.map((a) => a.userId);
  }
  if (rule.recipientKind === NotificationRecipientKind.OBJECT_ROLE && initiativeId && rule.recipientRole) {
    const assignments = await prisma.initiativeAssignment.findMany({
      where: {
        initiativeId,
        role: rule.recipientRole as "ACCOUNTABLE" | "IMPLEMENTER" | "CONSULTED" | "INFORMED"
      },
      select: { userId: true }
    });
    return assignments.map((a) => a.userId);
  }
  return [];
}

export type RecipientsWithChannelPlan = {
  userIds: string[];
  channelsByUser: Map<string, DeliveryChannel[]>;
};

/**
 * Resolve who is notified and which delivery channels each user gets from matching rules,
 * subscriptions, and the audit actor (always at least IN_APP for the actor).
 */
export async function getRecipientsWithChannelPlan(
  entry: AuditEntryForNotify
): Promise<RecipientsWithChannelPlan> {
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

  const rules = await prisma.notificationRule.findMany({
    where: {
      action: entry.action,
      entityType: entry.entityType,
      enabled: true
    }
  });

  const channelMap = new Map<string, Set<DeliveryChannel>>();
  const addChannels = (uid: string, ch: DeliveryChannel[]): void => {
    let set = channelMap.get(uid);
    if (!set) {
      set = new Set();
      channelMap.set(uid, set);
    }
    for (const c of ch) set.add(c);
  };

  for (const rule of rules) {
    if (!notificationRuleMatchesEventKind(rule.eventKind, details)) continue;
    const ch = parseRuleDeliveryChannels(rule.deliveryChannels);
    const uids = await resolveRuleRecipientUserIds(rule, initiativeId);
    for (const uid of uids) addChannels(uid, ch);
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
    select: { userId: true, deliveryChannels: true }
  });
  for (const sub of subs) {
    addChannels(sub.userId, parseRuleDeliveryChannels(sub.deliveryChannels));
  }

  addChannels(entry.userId, ["IN_APP"]);

  const rawUserIds = new Set<string>(channelMap.keys());

  const filtered: string[] = [];
  for (const uid of rawUserIds) {
    if (await canRead(uid, entry.entityType, entry.entityId)) filtered.push(uid);
  }

  const channelsByUser = new Map<string, DeliveryChannel[]>();
  for (const uid of filtered) {
    const set = channelMap.get(uid);
    const arr = set && set.size > 0 ? Array.from(set) : ["IN_APP"];
    channelsByUser.set(uid, arr.length > 0 ? arr : ["IN_APP"]);
  }

  return { userIds: filtered, channelsByUser };
}

/** Get list of userId to notify for this audit entry, after canRead filter. */
export async function getRecipientsForEntry(entry: AuditEntryForNotify): Promise<string[]> {
  const { userIds } = await getRecipientsWithChannelPlan(entry);
  return userIds;
}
