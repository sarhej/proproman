import { Priority } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireWriteAccess } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";

const requirementSchema = z.object({
  featureId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  isDone: z.boolean().default(false),
  priority: z.nativeEnum(Priority).default(Priority.P2)
});

export const requirementsRouter = Router();
requirementsRouter.use(requireAuth);

requirementsRouter.get("/", async (req, res) => {
  const featureId = typeof req.query.featureId === "string" ? req.query.featureId : undefined;
  const requirements = await prisma.requirement.findMany({
    where: featureId ? { featureId } : undefined,
    include: {
      feature: {
        include: {
          initiative: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
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
      description: parsed.data.description ?? null
    }
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
  const requirement = await prisma.requirement.update({
    where: { id },
    data: {
      featureId: parsed.data.featureId,
      title: parsed.data.title,
      description: parsed.data.description ?? undefined,
      isDone: parsed.data.isDone,
      priority: parsed.data.priority
    }
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
