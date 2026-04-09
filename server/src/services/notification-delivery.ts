import { AuditAction, DeliveryChannel, NotificationDeliveryStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { getRecipientsForEntry } from "./notification-matrix.js";
import {
  isTransactionalEmailEnabled,
  sendTransactionalEmail,
} from "./transactionalMail.js";

export type NotificationPayload = {
  titleKey: string;
  titleParams: Record<string, string>;
  bodyKey?: string;
  bodyParams?: Record<string, string>;
  linkLabelKey?: string;
  linkLabelParams?: Record<string, string>;
  linkUrl: string;
  entityType: string;
  entityId: string | null;
  source: string;
  type: string;
};

const SLACK_ENABLED = env.NOTIFICATION_SLACK_ENABLED === true;
const WHATSAPP_ENABLED = env.NOTIFICATION_WHATSAPP_ENABLED === true;

function canSendAuditNotificationEmail(): boolean {
  return env.NOTIFICATION_EMAIL_ENABLED && isTransactionalEmailEnabled();
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderNotificationEmail(payload: NotificationPayload): { subject: string; text: string; html: string } {
  const title = payload.titleParams.title ?? "Tymio";
  const subject = title.length > 120 ? `${title.slice(0, 117)}...` : title;
  const text = `${title}\n\n${payload.linkUrl}`;
  const html = `<p>${escapeHtmlText(title)}</p><p><a href="${escapeHtmlText(payload.linkUrl)}">Open in Tymio</a></p>`;
  return { subject, text, html };
}

async function resolveEmailRecipient(userId: string): Promise<string | null> {
  const pref = await prisma.userNotificationPreference.findUnique({
    where: { userId_channel: { userId, channel: "EMAIL" } }
  });
  const ident = pref?.channelIdentifier?.trim();
  if (ident) return ident;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  });
  return user?.email ?? null;
}

/** Deliver to IN_APP: create UserMessage and NotificationDelivery. Other channels: placeholder. */
export async function deliver(
  userId: string,
  channel: DeliveryChannel,
  payload: NotificationPayload,
  auditEntryId: string | null
): Promise<void> {
  if (channel === "IN_APP") {
    if (auditEntryId) {
      const existing = await prisma.userMessage.findFirst({
        where: { userId, auditEntryId }
      });
      if (existing) return;
    }
    const msg = await prisma.userMessage.create({
      data: {
        userId,
        title: null,
        body: null,
        linkLabel: null,
        titleKey: payload.titleKey,
        titleParams: payload.titleParams as object,
        bodyKey: payload.bodyKey ?? null,
        bodyParams: (payload.bodyParams as object) ?? null,
        linkLabelKey: payload.linkLabelKey ?? null,
        linkLabelParams: (payload.linkLabelParams as object) ?? null,
        linkUrl: payload.linkUrl,
        entityType: payload.entityType,
        entityId: payload.entityId,
        auditEntryId,
        source: payload.source,
        type: payload.type
      }
    });
    await prisma.notificationDelivery.create({
      data: {
        userMessageId: msg.id,
        userId,
        channel: "IN_APP",
        status: NotificationDeliveryStatus.SENT,
        sentAt: new Date()
      }
    });
    return;
  }
  if (channel === "EMAIL") {
    if (!canSendAuditNotificationEmail()) return;
    const to = await resolveEmailRecipient(userId);
    if (!to) {
      console.warn("[notification] EMAIL skipped: no address for user", userId);
      return;
    }
    const { subject, text, html } = renderNotificationEmail(payload);
    const delivery = await prisma.notificationDelivery.create({
      data: {
        userId,
        channel: "EMAIL",
        status: NotificationDeliveryStatus.PENDING,
        userMessageId: null
      }
    });
    try {
      await sendTransactionalEmail({
        to,
        subject,
        text,
        html,
        tags: [
          { name: "channel", value: "notification" },
          { name: "type", value: payload.type.slice(0, 80) }
        ]
      });
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: NotificationDeliveryStatus.SENT, sentAt: new Date() }
      });
    } catch (e) {
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: NotificationDeliveryStatus.FAILED }
      });
      throw e;
    }
    return;
  }
  if (channel === "SLACK" && SLACK_ENABLED) {
    await prisma.notificationDelivery.create({
      data: {
        userId,
        channel: "SLACK",
        status: NotificationDeliveryStatus.PENDING,
        userMessageId: null
      }
    });
    return;
  }
  if (channel === "WHATSAPP" && WHATSAPP_ENABLED) {
    await prisma.notificationDelivery.create({
      data: {
        userId,
        channel: "WHATSAPP",
        status: NotificationDeliveryStatus.PENDING,
        userMessageId: null
      }
    });
  }
}

/** Get delivery channels for a recipient (rule/subscription channels filtered by user prefs). Default IN_APP only. */
export async function getChannelsForUser(
  userId: string,
  ruleChannels: string[] | unknown
): Promise<DeliveryChannel[]> {
  const list = Array.isArray(ruleChannels) ? (ruleChannels as string[]) : ["IN_APP"];
  const channels: DeliveryChannel[] = [];
  for (const ch of list) {
    if (ch === "IN_APP" || ch === "EMAIL" || ch === "SLACK" || ch === "WHATSAPP") channels.push(ch as DeliveryChannel);
  }
  if (channels.length === 0) channels.push("IN_APP");
  const prefs = await prisma.userNotificationPreference.findMany({
    where: { userId, channel: { in: channels } }
  });
  const prefsMap = new Map(prefs.map((p) => [p.channel, p.enabled]));
  return channels.filter((ch) => {
    if (!prefsMap.has(ch)) return ch === "IN_APP";
    return prefsMap.get(ch) === true;
  });
}

/** Build notification payload from audit entry (i18n keys + params). */
export function buildPayload(
  entry: { action: AuditAction; entityType: string; entityId: string | null; details: Record<string, unknown> | null },
  baseUrl: string
): NotificationPayload {
  const action = entry.action;
  const entityType = entry.entityType;
  const entityId = entry.entityId;
  const details = entry.details ?? {};
  const title = (details.title as string) ?? (details.name as string) ?? entityType;
  const linkUrl =
    entityId && entityType === "INITIATIVE"
      ? `${baseUrl.replace(/\/$/, "")}/?initiative=${entityId}`
      : baseUrl.replace(/\/$/, "");
  const type = `${entityType}_${action}`;

  const titleKey = `notification.${entityType.toLowerCase()}.${action.toLowerCase()}`;
  const titleParams: Record<string, string> = { title };
  if (details.old !== undefined) titleParams.old = String(details.old);
  if (details.new !== undefined) titleParams.new = String(details.new);

  return {
    titleKey,
    titleParams,
    linkUrl,
    entityType,
    entityId,
    source: "notification",
    type
  };
}

/** Process one audit entry: resolve recipients, build payload, deliver. Called from logAudit. */
export async function processNotificationForAuditEntry(
  auditEntryId: string,
  baseUrl: string
): Promise<void> {
  const entry = await prisma.auditEntry.findUnique({
    where: { id: auditEntryId }
  });
  if (!entry) return;
  const entryForNotify = {
    id: entry.id,
    userId: entry.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    details: entry.details as Record<string, unknown> | null
  };
  const userIds = await getRecipientsForEntry(entryForNotify);
  const payload = buildPayload(
    {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: entry.details as Record<string, unknown> | null
    },
    baseUrl
  );
  const ruleChannels: DeliveryChannel[] = ["IN_APP"];
  if (canSendAuditNotificationEmail()) ruleChannels.push("EMAIL");

  for (const userId of userIds) {
    const channels = await getChannelsForUser(userId, ruleChannels);
    for (const ch of channels) {
      try {
        await deliver(userId, ch, payload, auditEntryId);
      } catch (e) {
        console.error("[notification] delivery failed:", userId, ch, e);
      }
    }
  }
}
