import { DemandSignalHint, Prisma, RiskLevel } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceContentWrite } from "../middleware/workspaceAuth.js";
import { logAudit } from "../services/audit.js";

export const riskSchema = z.object({
  title: z.string().min(1),
  probability: z.nativeEnum(RiskLevel),
  impact: z.nativeEnum(RiskLevel),
  mitigation: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  signalHint: z.nativeEnum(DemandSignalHint).optional()
});

export const riskPatchSchema = riskSchema.partial();

export const risksRouter = Router();
risksRouter.use(requireAuth);

risksRouter.post("/:initiativeId", requireWorkspaceContentWrite(), async (req, res) => {
  const initiativeId = String(req.params.initiativeId);
  const parsed = riskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const risk = await prisma.risk.create({
    data: {
      initiativeId,
      title: parsed.data.title,
      probability: parsed.data.probability,
      impact: parsed.data.impact,
      mitigation: parsed.data.mitigation ?? null,
      ownerId: parsed.data.ownerId ?? null,
      signalHint: parsed.data.signalHint ?? DemandSignalHint.NONE
    },
    include: { owner: true }
  });
  await logAudit(req.user!.id, "CREATED", "RISK", risk.id, { initiativeId, title: risk.title });
  res.status(201).json({ risk });
});

risksRouter.patch("/:id", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = riskPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const payload = parsed.data;
  const existing = await prisma.risk.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }
  const data: Prisma.RiskUncheckedUpdateInput = {};
  if (payload.title !== undefined) data.title = payload.title;
  if (payload.probability !== undefined) data.probability = payload.probability;
  if (payload.impact !== undefined) data.impact = payload.impact;
  if (payload.mitigation !== undefined) data.mitigation = payload.mitigation;
  if (payload.ownerId !== undefined) data.ownerId = payload.ownerId;
  if (payload.signalHint !== undefined) data.signalHint = payload.signalHint;
  const risk = await prisma.risk.update({
    where: { id },
    data,
    include: { owner: true }
  });
  await logAudit(req.user!.id, "UPDATED", "RISK", id, { initiativeId: risk.initiativeId, title: risk.title });
  res.json({ risk });
});

risksRouter.delete("/:id", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.risk.findUnique({ where: { id } });
  await prisma.risk.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "RISK", id, { initiativeId: existing?.initiativeId, title: existing?.title });
  res.status(204).send();
});
