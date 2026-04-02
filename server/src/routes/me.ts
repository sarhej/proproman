import { DeliveryChannel, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma, prismaUnscoped } from "../db.js";
import {
  canManageTenantLocaleSettings,
  normalizeEnabledLocalesPayload,
} from "../lib/appLocales.js";
import { requireAuth, requireSession } from "../middleware/auth.js";

const channels: DeliveryChannel[] = ["IN_APP", "EMAIL", "SLACK", "WHATSAPP"];

const patchSchema = z.object({
  preferences: z.array(
    z.object({
      channel: z.enum(["IN_APP", "EMAIL", "SLACK", "WHATSAPP"]),
      enabled: z.boolean(),
      channelIdentifier: z.string().optional().nullable()
    })
  )
});

/** Routes that allow `PENDING` users (mounted before `meRouter` in `index.ts`). */
export const meSessionRouter = Router();
meSessionRouter.use(requireSession);

meSessionRouter.get("/workspace-registration-requests", async (req, res, next) => {
  try {
    const email = req.user!.email;
    const requests = await prismaUnscoped.tenantRequest.findMany({
      where: { contactEmail: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        teamName: true,
        slug: true,
        status: true,
        createdAt: true,
        reviewNote: true,
      },
    });
    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get("/tenants", async (req, res) => {
  const userId = req.user!.id;
  const memberships = await prisma.tenantMembership.findMany({
    where: { userId },
    include: {
      tenant: { select: { id: true, name: true, slug: true, status: true, isSystem: true } },
    },
    orderBy: { tenant: { name: "asc" } },
  });
  const activeTenantId =
    req.tenantContext?.tenantId ??
    req.user!.activeTenantId ??
    null;
  res.json({ tenants: memberships, activeTenantId });
});

const patchLanguagesBody = z.object({
  enabledLocales: z.array(z.string()),
});

meRouter.patch("/active-tenant/languages", async (req, res, next) => {
  try {
    const ctx = req.tenantContext;
    if (!ctx) {
      res.status(400).json({ error: "Workspace context required. Select a workspace or set X-Tenant-Id." });
      return;
    }
    if (!canManageTenantLocaleSettings(req.user!.role, ctx.membershipRole)) {
      res.status(403).json({ error: "Only workspace owners and admins can change language options." });
      return;
    }
    const parsed = patchLanguagesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const normalized = normalizeEnabledLocalesPayload(parsed.data.enabledLocales);
    if (!normalized) {
      res.status(400).json({
        error: "enabledLocales must list at least one supported language (en, cs, sk, uk, pl).",
      });
      return;
    }
    const existing = await prismaUnscoped.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { settings: true },
    });
    const prevRaw = existing?.settings;
    const prev =
      prevRaw !== null &&
      prevRaw !== undefined &&
      typeof prevRaw === "object" &&
      !Array.isArray(prevRaw)
        ? { ...(prevRaw as Record<string, unknown>) }
        : {};
    prev.enabledLocales = normalized;
    await prismaUnscoped.tenant.update({
      where: { id: ctx.tenantId },
      data: { settings: prev as Prisma.InputJsonValue },
    });
    res.json({ enabledLocales: normalized });
  } catch (err) {
    next(err);
  }
});

meRouter.post("/tenants/switch", async (req, res) => {
  const userId = req.user!.id;
  const parsed = z.object({ tenantId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { tenantId } = parsed.data;
  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    include: { tenant: { select: { id: true, slug: true, status: true } } },
  });
  if (!membership || membership.tenant.status !== "ACTIVE") {
    res.status(403).json({ error: "Not a member of this tenant or tenant is not active." });
    return;
  }
  await prisma.user.update({ where: { id: userId }, data: { activeTenantId: tenantId } });
  req.session.activeTenantId = tenantId;
  req.session.save(() => {
    res.json({ ok: true, activeTenantId: tenantId });
  });
});

meRouter.get("/notification-preferences", async (req, res) => {
  const userId = req.user!.id;
  const rows = await prisma.userNotificationPreference.findMany({
    where: { userId },
    orderBy: { channel: "asc" }
  });
  const byChannel = Object.fromEntries(rows.map((r) => [r.channel, r]));
  const preferences = channels.map((channel) => {
    const row = byChannel[channel];
    return {
      channel,
      enabled: row?.enabled ?? channel === "IN_APP",
      channelIdentifier: row?.channelIdentifier ?? null
    };
  });
  res.json({ preferences });
});

meRouter.patch("/notification-preferences", async (req, res) => {
  const userId = req.user!.id;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  for (const pref of parsed.data.preferences) {
    await prisma.userNotificationPreference.upsert({
      where: {
        userId_channel: { userId, channel: pref.channel as DeliveryChannel }
      },
      create: {
        userId,
        channel: pref.channel as DeliveryChannel,
        enabled: pref.enabled,
        channelIdentifier: pref.channelIdentifier ?? undefined
      },
      update: {
        enabled: pref.enabled,
        ...(pref.channelIdentifier !== undefined && { channelIdentifier: pref.channelIdentifier })
      }
    });
  }
  const rows = await prisma.userNotificationPreference.findMany({
    where: { userId },
    orderBy: { channel: "asc" }
  });
  const byChannel = Object.fromEntries(rows.map((r) => [r.channel, r]));
  const preferences = channels.map((channel) => {
    const row = byChannel[channel];
    return {
      channel,
      enabled: row?.enabled ?? channel === "IN_APP",
      channelIdentifier: row?.channelIdentifier ?? null
    };
  });
  res.json({ preferences });
});
