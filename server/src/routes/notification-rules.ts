import { AuditAction, NotificationRecipientKind } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

const deliveryChannelsSchema = z.array(z.enum(["IN_APP", "EMAIL", "SLACK", "WHATSAPP"])).default(["IN_APP"]);

const createRuleSchema = z.object({
  action: z.nativeEnum(AuditAction),
  entityType: z.string().min(1),
  eventKind: z.string().optional().nullable(),
  recipientKind: z.nativeEnum(NotificationRecipientKind),
  recipientRole: z.string().optional().nullable(),
  deliveryChannels: deliveryChannelsSchema,
  enabled: z.boolean().default(true)
});

const updateRuleSchema = createRuleSchema.partial();

export const notificationRulesRouter = Router();

notificationRulesRouter.get("/", async (_req, res) => {
  const rules = await prisma.notificationRule.findMany({
    orderBy: [{ entityType: "asc" }, { action: "asc" }]
  });
  res.json({ rules });
});

notificationRulesRouter.post("/", async (req, res) => {
  const parsed = createRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const rule = await prisma.notificationRule.create({
    data: {
      action: parsed.data.action,
      entityType: parsed.data.entityType,
      eventKind: parsed.data.eventKind ?? null,
      recipientKind: parsed.data.recipientKind,
      recipientRole: parsed.data.recipientRole ?? null,
      deliveryChannels: parsed.data.deliveryChannels as object,
      enabled: parsed.data.enabled
    }
  });
  res.status(201).json({ rule });
});

notificationRulesRouter.put("/:id", async (req, res) => {
  const id = String(req.params.id);
  const parsed = updateRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const rule = await prisma.notificationRule.update({
    where: { id },
    data: {
      ...(parsed.data.action !== undefined && { action: parsed.data.action }),
      ...(parsed.data.entityType !== undefined && { entityType: parsed.data.entityType }),
      ...(parsed.data.eventKind !== undefined && { eventKind: parsed.data.eventKind }),
      ...(parsed.data.recipientKind !== undefined && { recipientKind: parsed.data.recipientKind }),
      ...(parsed.data.recipientRole !== undefined && { recipientRole: parsed.data.recipientRole }),
      ...(parsed.data.deliveryChannels !== undefined && { deliveryChannels: parsed.data.deliveryChannels as object }),
      ...(parsed.data.enabled !== undefined && { enabled: parsed.data.enabled })
    }
  });
  res.json({ rule });
});

notificationRulesRouter.delete("/:id", async (req, res) => {
  const id = String(req.params.id);
  await prisma.notificationRule.delete({ where: { id } });
  res.status(204).send();
});
