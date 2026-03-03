import { Horizon, Priority, UserRole } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { initiativeInclude } from "./serializers.js";
import { initiativeInputSchema, updatePositionsSchema } from "./schemas.js";
export const initiativesRouter = Router();
initiativesRouter.use(requireAuth);
initiativesRouter.get("/", async (req, res) => {
    const { domainId, ownerId, horizon, priority, isGap } = req.query;
    const where = {};
    if (typeof domainId === "string")
        where.domainId = domainId;
    if (typeof ownerId === "string")
        where.ownerId = ownerId;
    if (typeof horizon === "string" && Object.values(Horizon).includes(horizon)) {
        where.horizon = horizon;
    }
    if (typeof priority === "string" && Object.values(Priority).includes(priority)) {
        where.priority = priority;
    }
    if (typeof isGap === "string")
        where.isGap = isGap === "true";
    const initiatives = await prisma.initiative.findMany({
        where,
        include: initiativeInclude,
        orderBy: [{ domain: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "asc" }]
    });
    res.json({ initiatives });
});
initiativesRouter.get("/:id", async (req, res) => {
    const id = String(req.params.id);
    const initiative = await prisma.initiative.findUnique({
        where: { id },
        include: initiativeInclude
    });
    if (!initiative) {
        res.status(404).json({ error: "Initiative not found" });
        return;
    }
    res.json({ initiative });
});
initiativesRouter.post("/", requireRole(UserRole.ADMIN), async (req, res) => {
    const parsed = initiativeInputSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const payload = parsed.data;
    const initiative = await prisma.initiative.create({
        data: {
            title: payload.title,
            description: payload.description ?? null,
            domainId: payload.domainId,
            ownerId: payload.ownerId ?? null,
            priority: payload.priority,
            horizon: payload.horizon,
            status: payload.status,
            commercialType: payload.commercialType,
            isGap: payload.isGap,
            targetDate: payload.targetDate ? new Date(payload.targetDate) : null,
            notes: payload.notes ?? null,
            sortOrder: payload.sortOrder,
            personaImpacts: payload.personaImpacts
                ? {
                    createMany: {
                        data: payload.personaImpacts
                    }
                }
                : undefined,
            revenueWeights: payload.revenueWeights
                ? {
                    createMany: {
                        data: payload.revenueWeights
                    }
                }
                : undefined
        },
        include: initiativeInclude
    });
    res.status(201).json({ initiative });
});
initiativesRouter.put("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
    const id = String(req.params.id);
    const parsed = initiativeInputSchema.partial().safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const payload = parsed.data;
    const existing = await prisma.initiative.findUnique({ where: { id } });
    if (!existing) {
        res.status(404).json({ error: "Initiative not found" });
        return;
    }
    await prisma.$transaction(async (tx) => {
        if (payload.personaImpacts) {
            await tx.initiativePersonaImpact.deleteMany({ where: { initiativeId: id } });
            await tx.initiativePersonaImpact.createMany({
                data: payload.personaImpacts.map((p) => ({
                    initiativeId: id,
                    personaId: p.personaId,
                    impact: p.impact
                }))
            });
        }
        if (payload.revenueWeights) {
            await tx.initiativeRevenueStream.deleteMany({ where: { initiativeId: id } });
            await tx.initiativeRevenueStream.createMany({
                data: payload.revenueWeights.map((r) => ({
                    initiativeId: id,
                    revenueStreamId: r.revenueStreamId,
                    weight: r.weight
                }))
            });
        }
        await tx.initiative.update({
            where: { id },
            data: {
                title: payload.title,
                description: payload.description ?? undefined,
                domainId: payload.domainId,
                ownerId: payload.ownerId ?? undefined,
                priority: payload.priority,
                horizon: payload.horizon,
                status: payload.status,
                commercialType: payload.commercialType,
                isGap: payload.isGap,
                targetDate: payload.targetDate ? new Date(payload.targetDate) : payload.targetDate,
                notes: payload.notes ?? undefined,
                sortOrder: payload.sortOrder
            }
        });
    });
    const initiative = await prisma.initiative.findUnique({
        where: { id },
        include: initiativeInclude
    });
    res.json({ initiative });
});
initiativesRouter.post("/reorder", requireRole(UserRole.ADMIN), async (req, res) => {
    const parsed = updatePositionsSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const updates = parsed.data;
    await prisma.$transaction(updates.map((u) => prisma.initiative.update({
        where: { id: u.id },
        data: {
            domainId: u.domainId,
            sortOrder: u.sortOrder
        }
    })));
    res.json({ ok: true });
});
initiativesRouter.delete("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
    const id = String(req.params.id);
    await prisma.initiative.delete({
        where: { id }
    });
    res.status(204).send();
});
