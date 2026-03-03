import { Priority, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

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

requirementsRouter.post("/", requireRole(UserRole.ADMIN), async (req, res) => {
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
  res.status(201).json({ requirement });
});

requirementsRouter.put("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
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
  res.json({ requirement });
});

requirementsRouter.delete("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  await prisma.requirement.delete({ where: { id } });
  res.status(204).send();
});
