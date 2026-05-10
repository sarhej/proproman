import { Priority } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";
import { notifyAtlasAuxiliaryChange } from "../services/hubChangeHub.js";

const linksSchema = z.object({
  initiativeIds: z.array(z.string().min(1)).optional(),
  featureIds: z.array(z.string().min(1)).optional()
});

const useCaseSchema = z.object({
  title: z.string().min(1),
  productId: z.string().nullable().optional(),
  primaryActor: z.string().nullable().optional(),
  goal: z.string().nullable().optional(),
  preconditions: z.string().nullable().optional(),
  mainFlow: z.string().nullable().optional(),
  priority: z.nativeEnum(Priority).optional(),
  sortOrder: z.number().int().optional(),
  ...linksSchema.shape
});

export const useCasesRouter = Router();
useCasesRouter.use(requireAuth);

useCasesRouter.get("/", async (_req, res) => {
  const rows = await prisma.useCase.findMany({
    include: {
      product: true,
      initiativeLinks: { include: { initiative: true } },
      featureLinks: { include: { feature: true } }
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
  });
  res.json({ useCases: rows });
});

useCasesRouter.post("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = useCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { initiativeIds, featureIds, ...rest } = parsed.data;
  const uc = await prisma.$transaction(async (tx) => {
    const created = await tx.useCase.create({
      data: {
        title: rest.title,
        productId: rest.productId ?? null,
        primaryActor: rest.primaryActor ?? null,
        goal: rest.goal ?? null,
        preconditions: rest.preconditions ?? null,
        mainFlow: rest.mainFlow ?? null,
        priority: rest.priority ?? Priority.P2,
        sortOrder: rest.sortOrder ?? 0,
        initiativeLinks:
          initiativeIds && initiativeIds.length > 0
            ? { createMany: { data: initiativeIds.map((initiativeId) => ({ initiativeId })) } }
            : undefined,
        featureLinks:
          featureIds && featureIds.length > 0
            ? { createMany: { data: featureIds.map((featureId) => ({ featureId })) } }
            : undefined
      },
      include: {
        product: true,
        initiativeLinks: { include: { initiative: true } },
        featureLinks: { include: { feature: true } }
      }
    });
    return created;
  });
  await logAudit(req.user!.id, "CREATED", "USE_CASE", uc.id, { title: uc.title });
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.status(201).json({ useCase: uc });
});

useCasesRouter.put("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = useCaseSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { initiativeIds, featureIds, ...rest } = parsed.data;
  await prisma.$transaction(async (tx) => {
    if (initiativeIds !== undefined) {
      await tx.useCaseInitiative.deleteMany({ where: { useCaseId: id } });
      if (initiativeIds.length > 0) {
        await tx.useCaseInitiative.createMany({
          data: initiativeIds.map((initiativeId) => ({ useCaseId: id, initiativeId }))
        });
      }
    }
    if (featureIds !== undefined) {
      await tx.useCaseFeature.deleteMany({ where: { useCaseId: id } });
      if (featureIds.length > 0) {
        await tx.useCaseFeature.createMany({
          data: featureIds.map((featureId) => ({ useCaseId: id, featureId }))
        });
      }
    }
    await tx.useCase.update({
      where: { id },
      data: {
        title: rest.title,
        productId: rest.productId !== undefined ? rest.productId : undefined,
        primaryActor: rest.primaryActor !== undefined ? rest.primaryActor : undefined,
        goal: rest.goal !== undefined ? rest.goal : undefined,
        preconditions: rest.preconditions !== undefined ? rest.preconditions : undefined,
        mainFlow: rest.mainFlow !== undefined ? rest.mainFlow : undefined,
        priority: rest.priority,
        sortOrder: rest.sortOrder
      }
    });
  });
  const useCase = await prisma.useCase.findUnique({
    where: { id },
    include: {
      product: true,
      initiativeLinks: { include: { initiative: true } },
      featureLinks: { include: { feature: true } }
    }
  });
  await logAudit(req.user!.id, "UPDATED", "USE_CASE", id);
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.json({ useCase });
});

useCasesRouter.delete("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  await prisma.useCase.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "USE_CASE", id);
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.status(204).send();
});
