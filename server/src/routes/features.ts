import { FeatureStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const featureSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  status: z.nativeEnum(FeatureStatus).default(FeatureStatus.IDEA),
  sortOrder: z.number().int().default(0)
});

export const featuresRouter = Router();
featuresRouter.use(requireAuth);

featuresRouter.post("/:initiativeId", requireRole(UserRole.ADMIN), async (req, res) => {
  const initiativeId = String(req.params.initiativeId);
  const parsed = featureSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const feature = await prisma.feature.create({
    data: {
      initiativeId,
      ...parsed.data,
      description: parsed.data.description ?? null,
      ownerId: parsed.data.ownerId ?? null
    },
    include: { owner: true }
  });
  res.status(201).json({ feature });
});

featuresRouter.put("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  const parsed = featureSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const feature = await prisma.feature.update({
    where: { id },
    data: {
      ...parsed.data,
      description: parsed.data.description ?? undefined,
      ownerId: parsed.data.ownerId ?? undefined
    },
    include: { owner: true }
  });
  res.json({ feature });
});

featuresRouter.delete("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  await prisma.feature.delete({ where: { id } });
  res.status(204).send();
});
