import { Prisma, Priority, TaskStatus, TaskType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireWriteAccess } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import { requirementReorderSchema } from "./schemas.js";

const labelsSchema = z.array(z.string()).nullable().optional();
const metadataSchema = z.record(z.unknown()).nullable().optional();

export const requirementSchema = z.object({
  featureId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.NOT_STARTED),
  isDone: z.boolean().default(false),
  priority: z.nativeEnum(Priority).default(Priority.P2),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  estimate: z.string().nullable().optional(),
  labels: labelsSchema,
  taskType: z.nativeEnum(TaskType).nullable().optional(),
  blockedReason: z.string().nullable().optional(),
  externalRef: z.string().nullable().optional(),
  metadata: metadataSchema,
  sortOrder: z.number().int().default(0)
});

export const requirementsRouter = Router();
requirementsRouter.use(requireAuth);

requirementsRouter.post("/reorder", requireWriteAccess(), async (req, res) => {
  const parsed = requirementReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (parsed.data.length === 0) {
    res.status(400).json({ error: "Empty reorder payload" });
    return;
  }
  const payloadIds = parsed.data.map((u) => u.id);
  if (new Set(payloadIds).size !== payloadIds.length) {
    res.status(400).json({ error: "Duplicate requirement ids in reorder payload" });
    return;
  }
  const first = await prisma.requirement.findUnique({
    where: { id: parsed.data[0].id },
    select: { featureId: true }
  });
  if (!first) {
    res.status(400).json({ error: "Unknown requirement" });
    return;
  }
  const siblings = await prisma.requirement.findMany({
    where: { featureId: first.featureId },
    select: { id: true }
  });
  const expected = new Set(siblings.map((s) => s.id));
  if (expected.size !== payloadIds.length || !payloadIds.every((id) => expected.has(id))) {
    res.status(400).json({ error: "Payload must list every requirement in the feature exactly once" });
    return;
  }
  await prisma.$transaction(
    parsed.data.map((u) =>
      prisma.requirement.update({
        where: { id: u.id },
        data: { sortOrder: u.sortOrder }
      })
    )
  );
  res.json({ ok: true });
});

requirementsRouter.get("/", async (req, res) => {
  const featureId = typeof req.query.featureId === "string" ? req.query.featureId : undefined;
  const requirements = await prisma.requirement.findMany({
    where: featureId ? { featureId } : undefined,
    include: {
      feature: {
        include: {
          initiative: true
        }
      },
      assignee: true
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
  res.json({ requirements });
});

requirementsRouter.post("/", requireWriteAccess(), async (req, res) => {
  const parsed = requirementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const requirement = await prisma.requirement.create({
    data: {
      ...parsed.data,
      description: parsed.data.description ?? null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      assigneeId: parsed.data.assigneeId ?? null,
      estimate: parsed.data.estimate ?? null,
      labels: parsed.data.labels === null ? Prisma.JsonNull : ((parsed.data.labels ?? undefined) as Prisma.InputJsonValue),
      taskType: parsed.data.taskType ?? null,
      blockedReason: parsed.data.blockedReason ?? null,
      externalRef: parsed.data.externalRef ?? null,
      metadata: parsed.data.metadata === null ? Prisma.JsonNull : ((parsed.data.metadata ?? undefined) as Prisma.InputJsonValue)
    },
    include: { assignee: true }
  });
  await logAudit(req.user!.id, "CREATED", "REQUIREMENT", requirement.id, { featureId: parsed.data.featureId, title: requirement.title });
  res.status(201).json({ requirement });
});

requirementsRouter.put("/:id", requireWriteAccess(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = requirementSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const updateData: Prisma.RequirementUncheckedUpdateInput = {};
  if (parsed.data.featureId !== undefined) updateData.featureId = parsed.data.featureId;
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.isDone !== undefined) updateData.isDone = parsed.data.isDone;
  if (parsed.data.priority !== undefined) updateData.priority = parsed.data.priority;
  if (parsed.data.assigneeId !== undefined) updateData.assigneeId = parsed.data.assigneeId ?? null;
  if (parsed.data.dueDate !== undefined) updateData.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  if (parsed.data.estimate !== undefined) updateData.estimate = parsed.data.estimate;
  if (parsed.data.labels !== undefined) updateData.labels = parsed.data.labels === null ? Prisma.JsonNull : (parsed.data.labels as Prisma.InputJsonValue);
  if (parsed.data.taskType !== undefined) updateData.taskType = parsed.data.taskType;
  if (parsed.data.blockedReason !== undefined) updateData.blockedReason = parsed.data.blockedReason;
  if (parsed.data.externalRef !== undefined) updateData.externalRef = parsed.data.externalRef;
  if (parsed.data.metadata !== undefined) updateData.metadata = parsed.data.metadata === null ? Prisma.JsonNull : (parsed.data.metadata as Prisma.InputJsonValue);
  if (parsed.data.sortOrder !== undefined) updateData.sortOrder = parsed.data.sortOrder;
  const requirement = await prisma.requirement.update({
    where: { id },
    data: updateData,
    include: { assignee: true }
  });
  await logAudit(req.user!.id, "UPDATED", "REQUIREMENT", id, { featureId: requirement.featureId, title: requirement.title });
  res.json({ requirement });
});

requirementsRouter.delete("/:id", requireWriteAccess(), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.requirement.findUnique({ where: { id } });
  await prisma.requirement.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "REQUIREMENT", id, { featureId: existing?.featureId, title: existing?.title });
  res.status(204).send();
});
