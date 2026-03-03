import { UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const decisionSchema = z.object({
  title: z.string().min(1),
  rationale: z.string().nullable().optional(),
  impactedTeams: z.string().nullable().optional(),
  decidedAt: z.string().datetime().nullable().optional()
});

export const decisionsRouter = Router();
decisionsRouter.use(requireAuth);

decisionsRouter.post("/:initiativeId", requireRole(UserRole.ADMIN), async (req, res) => {
  const initiativeId = String(req.params.initiativeId);
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const decision = await prisma.decision.create({
    data: {
      initiativeId,
      title: parsed.data.title,
      rationale: parsed.data.rationale ?? null,
      impactedTeams: parsed.data.impactedTeams ?? null,
      decidedAt: parsed.data.decidedAt ? new Date(parsed.data.decidedAt) : null
    }
  });
  res.status(201).json({ decision });
});

decisionsRouter.delete("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  await prisma.decision.delete({ where: { id } });
  res.status(204).send();
});
