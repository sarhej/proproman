import { StakeholderRole, StakeholderType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireWriteAccess } from "../middleware/auth.js";

const stakeholderSchema = z.object({
  name: z.string().min(1),
  role: z.nativeEnum(StakeholderRole),
  type: z.nativeEnum(StakeholderType),
  organization: z.string().nullable().optional(),
});

export const stakeholdersRouter = Router();
stakeholdersRouter.use(requireAuth);

stakeholdersRouter.post("/:initiativeId", requireWriteAccess(), async (req, res) => {
  const initiativeId = String(req.params.initiativeId);
  const parsed = stakeholderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const stakeholder = await prisma.stakeholder.create({
    data: {
      initiativeId,
      name: parsed.data.name,
      role: parsed.data.role,
      type: parsed.data.type,
      organization: parsed.data.organization ?? null,
    },
  });
  res.status(201).json({ stakeholder });
});

stakeholdersRouter.put("/:id", requireWriteAccess(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = stakeholderSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const stakeholder = await prisma.stakeholder.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.role !== undefined && { role: parsed.data.role }),
      ...(parsed.data.type !== undefined && { type: parsed.data.type }),
      ...(parsed.data.organization !== undefined && { organization: parsed.data.organization }),
    },
  });
  res.json({ stakeholder });
});

stakeholdersRouter.delete("/:id", requireWriteAccess(), async (req, res) => {
  const id = String(req.params.id);
  await prisma.stakeholder.delete({ where: { id } });
  res.status(204).send();
});
