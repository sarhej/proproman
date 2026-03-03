import { Horizon, Prisma, Priority, UserRole } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole, requireWriteAccess } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import { initiativeInclude } from "./serializers.js";
import { initiativeInputSchema, updatePositionsSchema } from "./schemas.js";

export const initiativesRouter = Router();

initiativesRouter.use(requireAuth);

initiativesRouter.get("/", async (req, res) => {
  const { domainId, ownerId, horizon, priority, isGap } = req.query;
  const where: Prisma.InitiativeWhereInput = {};

  if (typeof domainId === "string") where.domainId = domainId;
  if (typeof ownerId === "string") where.ownerId = ownerId;
  if (typeof horizon === "string" && Object.values(Horizon).includes(horizon as Horizon)) {
    where.horizon = horizon as Horizon;
  }
  if (typeof priority === "string" && Object.values(Priority).includes(priority as Priority)) {
    where.priority = priority as Priority;
  }
  if (typeof isGap === "string") where.isGap = isGap === "true";

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

initiativesRouter.post("/", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const parsed = initiativeInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const payload = parsed.data;

  const accountableUser = payload.assignments?.find((a) => a.role === "ACCOUNTABLE");
  const effectiveOwnerId = accountableUser ? accountableUser.userId : (payload.ownerId ?? null);

  const initiative = await prisma.initiative.create({
    data: {
      title: payload.title,
      productId: payload.productId ?? null,
      description: payload.description ?? null,
      domainId: payload.domainId,
      ownerId: effectiveOwnerId,
      priority: payload.priority,
      horizon: payload.horizon,
      status: payload.status,
      commercialType: payload.commercialType,
      isGap: payload.isGap,
      startDate: payload.startDate ? new Date(payload.startDate) : null,
      targetDate: payload.targetDate ? new Date(payload.targetDate) : null,
      milestoneDate: payload.milestoneDate ? new Date(payload.milestoneDate) : null,
      dateConfidence: payload.dateConfidence ?? null,
      arrImpact: payload.arrImpact ?? null,
      renewalDate: payload.renewalDate ? new Date(payload.renewalDate) : null,
      dealStage: payload.dealStage ?? null,
      strategicTier: payload.strategicTier ?? null,
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
        : undefined,
      demandLinks: payload.demandLinks
        ? {
            createMany: {
              data: payload.demandLinks.map((d) => ({
                demandId: d.demandId,
                featureId: d.featureId ?? null
              }))
            }
          }
        : undefined,
      assignments: payload.assignments
        ? {
            createMany: {
              data: payload.assignments.map((a) => ({
                userId: a.userId,
                role: a.role,
                allocation: a.allocation ?? null
              }))
            }
          }
        : undefined
    },
    include: initiativeInclude
  });

  await logAudit(req.user!.id, "CREATED", "INITIATIVE", initiative.id, { title: initiative.title });
  res.status(201).json({ initiative });
});

initiativesRouter.put("/:id", requireWriteAccess(), async (req, res) => {
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
    if (payload.demandLinks) {
      await tx.demandLink.deleteMany({ where: { initiativeId: id } });
      await tx.demandLink.createMany({
        data: payload.demandLinks.map((d) => ({
          demandId: d.demandId,
          initiativeId: id,
          featureId: d.featureId ?? null
        }))
      });
    }
    if (payload.assignments) {
      await tx.initiativeAssignment.deleteMany({ where: { initiativeId: id } });
      await tx.initiativeAssignment.createMany({
        data: payload.assignments.map((a) => ({
          initiativeId: id,
          userId: a.userId,
          role: a.role,
          allocation: a.allocation ?? null
        }))
      });
    }
    const accountableFromAssignments = payload.assignments?.find((a) => a.role === "ACCOUNTABLE");
    const ownerIdUpdate = payload.assignments !== undefined
      ? (accountableFromAssignments ? accountableFromAssignments.userId : null)
      : (payload.ownerId ?? undefined);

    await tx.initiative.update({
      where: { id },
      data: {
        title: payload.title,
        productId: payload.productId ?? undefined,
        description: payload.description ?? undefined,
        domainId: payload.domainId,
        ownerId: ownerIdUpdate,
        priority: payload.priority,
        horizon: payload.horizon,
        status: payload.status,
        commercialType: payload.commercialType,
        isGap: payload.isGap,
        startDate: payload.startDate ? new Date(payload.startDate) : payload.startDate,
        targetDate: payload.targetDate ? new Date(payload.targetDate) : payload.targetDate,
        milestoneDate: payload.milestoneDate ? new Date(payload.milestoneDate) : payload.milestoneDate,
        dateConfidence: payload.dateConfidence ?? undefined,
        arrImpact: payload.arrImpact ?? undefined,
        renewalDate: payload.renewalDate ? new Date(payload.renewalDate) : payload.renewalDate,
        dealStage: payload.dealStage ?? undefined,
        strategicTier: payload.strategicTier ?? undefined,
        notes: payload.notes ?? undefined,
        sortOrder: payload.sortOrder
      }
    });
  });

  const initiative = await prisma.initiative.findUnique({
    where: { id },
    include: initiativeInclude
  });
  if (payload.status && payload.status !== existing.status) {
    await logAudit(req.user!.id, "STATUS_CHANGED", "INITIATIVE", id, { old: existing.status, new: payload.status });
  } else {
    await logAudit(req.user!.id, "UPDATED", "INITIATIVE", id);
  }
  res.json({ initiative });
});

initiativesRouter.post("/reorder", requireWriteAccess(), async (req, res) => {
  const parsed = updatePositionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const updates = parsed.data;
  await prisma.$transaction(
    updates.map((u) =>
      prisma.initiative.update({
        where: { id: u.id },
        data: {
          domainId: u.domainId,
          sortOrder: u.sortOrder
        }
      })
    )
  );
  res.json({ ok: true });
});

initiativesRouter.delete("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.initiative.findUnique({ where: { id } });
  await prisma.initiative.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "INITIATIVE", id, { title: existing?.title });
  res.status(204).send();
});
