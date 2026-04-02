import { DeliveryChannel } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma, prismaUnscoped } from "../db.js";
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
