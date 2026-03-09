import { DeliveryChannel } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

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

export const meRouter = Router();
meRouter.use(requireAuth);

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
