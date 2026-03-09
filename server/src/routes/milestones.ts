import { MilestoneStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireWriteAccess } from "../middleware/auth.js";

const milestoneSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.nativeEnum(MilestoneStatus).default(MilestoneStatus.TODO),
  targetDate: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  sequence: z.number().int().default(0),
});

export const milestonesRouter = Router();
milestonesRouter.use(requireAuth);

milestonesRouter.get("/", async (_req, res) => {
  const milestones = await prisma.initiativeMilestone.findMany({
    where: { initiative: { archivedAt: null } },
    include: {
      owner: { select: { id: true, name: true } },
      initiative: {
        select: { id: true, title: true, horizon: true, domain: { select: { id: true, name: true, color: true } }, owner: { select: { id: true, name: true } } },
      },
    },
    orderBy: { targetDate: "asc" },
  });
  res.json({ milestones });
});

milestonesRouter.post("/:initiativeId", requireWriteAccess(), async (req, res) => {
  const initiativeId = String(req.params.initiativeId);
  const parsed = milestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const milestone = await prisma.initiativeMilestone.create({
    data: {
      initiativeId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      status: parsed.data.status,
      targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null,
      ownerId: parsed.data.ownerId ?? null,
      sequence: parsed.data.sequence,
    },
    include: { owner: true },
  });
  res.status(201).json({ milestone });
});

milestonesRouter.put("/:id", requireWriteAccess(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = milestoneSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.targetDate !== undefined)
    data.targetDate = parsed.data.targetDate ? new Date(parsed.data.targetDate) : null;
  if (parsed.data.ownerId !== undefined) data.ownerId = parsed.data.ownerId;
  if (parsed.data.sequence !== undefined) data.sequence = parsed.data.sequence;

  const milestone = await prisma.initiativeMilestone.update({
    where: { id },
    data,
    include: { owner: true },
  });
  res.json({ milestone });
});

milestonesRouter.delete("/:id", requireWriteAccess(), async (req, res) => {
  const id = String(req.params.id);
  await prisma.initiativeMilestone.delete({ where: { id } });
  res.status(204).send();
});
