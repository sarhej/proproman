import { AuditAction, NotificationScope } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const deliveryChannelsSchema = z.array(z.enum(["IN_APP", "EMAIL", "SLACK", "WHATSAPP"])).default(["IN_APP"]);

const createSubscriptionSchema = z.object({
  action: z.nativeEnum(AuditAction),
  entityType: z.string().min(1),
  scopeType: z.nativeEnum(NotificationScope),
  scopeId: z.string().optional().nullable(),
  deliveryChannels: deliveryChannelsSchema
});

export const notificationSubscriptionsRouter = Router();
notificationSubscriptionsRouter.use(requireAuth);

notificationSubscriptionsRouter.get("/", async (req, res) => {
  const userId = req.user!.id;
  const subscriptions = await prisma.userNotificationSubscription.findMany({
    where: { userId },
    orderBy: [{ entityType: "asc" }, { action: "asc" }]
  });
  res.json({ subscriptions });
});

notificationSubscriptionsRouter.post("/", async (req, res) => {
  const userId = req.user!.id;
  const parsed = createSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const sub = await prisma.userNotificationSubscription.create({
    data: {
      userId,
      action: parsed.data.action,
      entityType: parsed.data.entityType,
      scopeType: parsed.data.scopeType,
      scopeId: parsed.data.scopeId ?? null,
      deliveryChannels: (parsed.data.deliveryChannels ?? ["IN_APP"]) as object
    }
  });
  res.status(201).json({ subscription: sub });
});

notificationSubscriptionsRouter.delete("/:id", async (req, res) => {
  const userId = req.user!.id;
  const id = String(req.params.id);
  const existing = await prisma.userNotificationSubscription.findFirst({
    where: { id, userId }
  });
  if (!existing) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }
  await prisma.userNotificationSubscription.delete({ where: { id } });
  res.status(204).send();
});
