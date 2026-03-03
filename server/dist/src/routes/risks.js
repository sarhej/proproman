import { RiskLevel, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
const riskSchema = z.object({
    title: z.string().min(1),
    probability: z.nativeEnum(RiskLevel),
    impact: z.nativeEnum(RiskLevel),
    mitigation: z.string().nullable().optional(),
    ownerId: z.string().nullable().optional()
});
export const risksRouter = Router();
risksRouter.use(requireAuth);
risksRouter.post("/:initiativeId", requireRole(UserRole.ADMIN), async (req, res) => {
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
            ownerId: parsed.data.ownerId ?? null
        },
        include: { owner: true }
    });
    res.status(201).json({ risk });
});
risksRouter.delete("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
    const id = String(req.params.id);
    await prisma.risk.delete({ where: { id } });
    res.status(204).send();
});
