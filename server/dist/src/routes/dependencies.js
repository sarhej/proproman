import { UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
const dependencySchema = z.object({
    fromInitiativeId: z.string(),
    toInitiativeId: z.string(),
    description: z.string().nullable().optional()
});
export const dependenciesRouter = Router();
dependenciesRouter.use(requireAuth);
dependenciesRouter.post("/", requireRole(UserRole.ADMIN), async (req, res) => {
    const parsed = dependencySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const dep = await prisma.dependency.create({
        data: {
            fromInitiativeId: parsed.data.fromInitiativeId,
            toInitiativeId: parsed.data.toInitiativeId,
            description: parsed.data.description ?? null
        }
    });
    res.status(201).json({ dependency: dep });
});
dependenciesRouter.delete("/", requireRole(UserRole.ADMIN), async (req, res) => {
    const parsed = dependencySchema.pick({ fromInitiativeId: true, toInitiativeId: true }).safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    await prisma.dependency.delete({
        where: {
            fromInitiativeId_toInitiativeId: {
                fromInitiativeId: parsed.data.fromInitiativeId,
                toInitiativeId: parsed.data.toInitiativeId
            }
        }
    });
    res.status(204).send();
});
