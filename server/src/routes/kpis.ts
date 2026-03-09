import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireWriteAccess } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";

const kpiSchema = z.object({
  title: z.string().min(1),
  targetValue: z.string().nullable().optional(),
  currentValue: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  targetDate: z.string().nullable().optional(),
});

export const kpisRouter = Router();
kpisRouter.use(requireAuth);

kpisRouter.get("/", async (_req, res) => {
  const kpis = await prisma.initiativeKPI.findMany({
    include: {
      initiative: {
        select: { id: true, title: true, startDate: true, domain: { select: { id: true, name: true, color: true } }, owner: { select: { id: true, name: true } } },
      },
    },
    orderBy: { initiative: { title: "asc" } },
  });
  res.json({ kpis });
});

kpisRouter.post("/:initiativeId", requireWriteAccess(), async (req, res) => {
  const initiativeId = String(req.params.initiativeId);
  const parsed = kpiSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const kpi = await prisma.initiativeKPI.create({
    data: {
      initiativeId,
      title: parsed.data.title,
      targetValue: parsed.data.targetValue ?? null,
      currentValue: parsed.data.currentValue ?? null,
      unit: parsed.data.unit ?? null,
      targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null,
    },
  });
  await logAudit(req.user!.id, "CREATED", "KPI", kpi.id, { initiativeId, title: kpi.title });
  res.status(201).json({ kpi });
});

kpisRouter.put("/:id", requireWriteAccess(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = kpiSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const kpi = await prisma.initiativeKPI.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.targetValue !== undefined && { targetValue: parsed.data.targetValue }),
      ...(parsed.data.currentValue !== undefined && { currentValue: parsed.data.currentValue }),
      ...(parsed.data.unit !== undefined && { unit: parsed.data.unit }),
      ...(parsed.data.targetDate !== undefined && { targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null }),
    },
  });
  await logAudit(req.user!.id, "UPDATED", "KPI", id, { title: kpi.title });
  res.json({ kpi });
});

kpisRouter.delete("/:id", requireWriteAccess(), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.initiativeKPI.findUnique({ where: { id } });
  await prisma.initiativeKPI.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "KPI", id, { initiativeId: existing?.initiativeId, title: existing?.title });
  res.status(204).send();
});
