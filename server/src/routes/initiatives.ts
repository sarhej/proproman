import { Horizon, Prisma, Priority, UserRole } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireRole, requireWriteAccess } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";
import { initiativeInclude } from "./serializers.js";
import { initiativeInputSchema, updatePositionsSchema } from "./schemas.js";

export const initiativesRouter = Router();

initiativesRouter.use(requireAuth);

/** EDITOR can only edit initiatives they own or are assigned to (any RACI role). */
async function canUserEditInitiative(userId: string, userRole: UserRole, initiativeId: string): Promise<boolean> {
  if (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN) return true;
  const initiative = await prisma.initiative.findUnique({
    where: { id: initiativeId },
    select: { ownerId: true, assignments: { select: { userId: true } } }
  });
  if (!initiative) return false;
  if (initiative.ownerId === userId) return true;
  if (initiative.assignments.some((a) => a.userId === userId)) return true;
  return false;
}

initiativesRouter.get("/", async (req, res) => {
  const { domainId, ownerId, horizon, priority, isGap, archived, labels } = req.query;
  const where: Prisma.InitiativeWhereInput = {};
  const selectedLabels = (Array.isArray(labels) ? labels : [labels])
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (typeof domainId === "string") where.domainId = domainId;
  if (typeof ownerId === "string") where.ownerId = ownerId;
  if (typeof horizon === "string" && Object.values(Horizon).includes(horizon as Horizon)) {
    where.horizon = horizon as Horizon;
  }
  if (typeof priority === "string" && Object.values(Priority).includes(priority as Priority)) {
    where.priority = priority as Priority;
  }
  if (typeof isGap === "string") where.isGap = isGap === "true";
  if (archived === "true") {
    where.archivedAt = { not: null };
  } else {
    where.archivedAt = null;
  }
  if (selectedLabels.length > 0) {
    const existingAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    where.AND = [
      ...existingAnd,
      {
        OR: selectedLabels.flatMap((label) => [
          { features: { some: { labels: { array_contains: [label] } } } },
          { features: { some: { requirements: { some: { labels: { array_contains: [label] } } } } } }
        ])
      }
    ];
  }

  const initiatives = await prisma.initiative.findMany({
    where,
    include: initiativeInclude,
    orderBy: [{ domain: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "asc" }]
  });
  res.json({ initiatives });
});

initiativesRouter.get("/:id/comments", async (req, res) => {
  const initiativeId = String(req.params.id);
  const initiative = await prisma.initiative.findUnique({ where: { id: initiativeId } });
  if (!initiative) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }
  const comments = await prisma.initiativeComment.findMany({
    where: { initiativeId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" }
  });
  res.json({ comments });
});

initiativesRouter.post("/:id/comments", requireWriteAccess(), async (req, res) => {
  const initiativeId = String(req.params.id);
  const userId = req.user!.id;
  const body = req.body as { text?: string };
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  const initiative = await prisma.initiative.findUnique({ where: { id: initiativeId } });
  if (!initiative) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }
  if (!(await canUserEditInitiative(userId, req.user!.role, initiativeId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const comment = await prisma.initiativeComment.create({
    data: { initiativeId, userId, text },
    include: { user: { select: { id: true, name: true } } }
  });
  await logAudit(req.user!.id, "CREATED", "COMMENT", comment.id, { initiativeId });
  res.status(201).json({ comment });
});

initiativesRouter.get("/:id/success-criteria", async (req, res) => {
  const initiativeId = String(req.params.id);
  const initiative = await prisma.initiative.findUnique({ where: { id: initiativeId } });
  if (!initiative) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }
  const items = await prisma.successCriterion.findMany({
    where: { initiativeId },
    orderBy: { sortOrder: "asc" }
  });
  res.json({ successCriteria: items });
});

initiativesRouter.post("/:id/success-criteria", requireWriteAccess(), async (req, res) => {
  const initiativeId = String(req.params.id);
  const body = req.body as { title?: string; sortOrder?: number };
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const initiative = await prisma.initiative.findUnique({ where: { id: initiativeId } });
  if (!initiative) {
    res.status(404).json({ error: "Initiative not found" });
    return;
  }
  if (!(await canUserEditInitiative(req.user!.id, req.user!.role, initiativeId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const count = await prisma.successCriterion.count({ where: { initiativeId } });
  const item = await prisma.successCriterion.create({
    data: { initiativeId, title, sortOrder: body?.sortOrder ?? count }
  });
  await logAudit(req.user!.id, "CREATED", "SUCCESS_CRITERION", item.id, { initiativeId, title: item.title });
  res.status(201).json({ successCriterion: item });
});

initiativesRouter.patch("/:id/success-criteria/:criterionId", requireWriteAccess(), async (req, res) => {
  const initiativeId = String(req.params.id);
  const criterionId = String(req.params.criterionId);
  const body = req.body as { title?: string; isDone?: boolean; sortOrder?: number };
  const existing = await prisma.successCriterion.findFirst({
    where: { id: criterionId, initiativeId }
  });
  if (!existing) {
    res.status(404).json({ error: "Success criterion not found" });
    return;
  }
  if (!(await canUserEditInitiative(req.user!.id, req.user!.role, initiativeId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const item = await prisma.successCriterion.update({
    where: { id: criterionId },
    data: {
      ...(typeof body.title === "string" && { title: body.title.trim() }),
      ...(typeof body.isDone === "boolean" && { isDone: body.isDone }),
      ...(typeof body.sortOrder === "number" && { sortOrder: body.sortOrder })
    }
  });
  await logAudit(req.user!.id, "UPDATED", "SUCCESS_CRITERION", criterionId, { initiativeId, title: item.title });
  res.json({ successCriterion: item });
});

initiativesRouter.delete("/:id/success-criteria/:criterionId", requireWriteAccess(), async (req, res) => {
  const initiativeId = String(req.params.id);
  const criterionId = String(req.params.criterionId);
  const existing = await prisma.successCriterion.findFirst({
    where: { id: criterionId, initiativeId }
  });
  if (!existing) {
    res.status(404).json({ error: "Success criterion not found" });
    return;
  }
  if (!(await canUserEditInitiative(req.user!.id, req.user!.role, initiativeId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await logAudit(req.user!.id, "DELETED", "SUCCESS_CRITERION", criterionId, { initiativeId, title: existing.title });
  await prisma.successCriterion.delete({ where: { id: criterionId } });
  res.status(204).send();
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

initiativesRouter.post("/", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EDITOR), async (req, res) => {
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
  if (!(await canUserEditInitiative(req.user!.id, req.user!.role, id))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (req.user!.role !== UserRole.SUPER_ADMIN && req.user!.role !== UserRole.ADMIN) {
    delete payload.productId;
    delete payload.horizon;
    delete payload.commercialType;
    delete payload.dealStage;
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
  for (const u of updates) {
    if (!(await canUserEditInitiative(req.user!.id, req.user!.role, u.id))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
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

initiativesRouter.patch("/:id/archive", requireWriteAccess(), async (req, res) => {
  const id = String(req.params.id);
  if (!(await canUserEditInitiative(req.user!.id, req.user!.role, id))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const initiative = await prisma.initiative.update({
    where: { id },
    data: { archivedAt: new Date() },
    include: initiativeInclude
  });
  await logAudit(req.user!.id, "UPDATED", "INITIATIVE", id, { archived: true });
  res.json({ initiative });
});

initiativesRouter.patch("/:id/unarchive", requireWriteAccess(), async (req, res) => {
  const id = String(req.params.id);
  if (!(await canUserEditInitiative(req.user!.id, req.user!.role, id))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const initiative = await prisma.initiative.update({
    where: { id },
    data: { archivedAt: null },
    include: initiativeInclude
  });
  await logAudit(req.user!.id, "UPDATED", "INITIATIVE", id, { archived: false });
  res.json({ initiative });
});

initiativesRouter.delete("/:id", requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.initiative.findUnique({ where: { id } });
  await prisma.initiative.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "INITIATIVE", id, { title: existing?.title });
  res.status(204).send();
});
