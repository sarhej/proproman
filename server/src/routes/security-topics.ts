import { SecurityTopicCategory, SecurityTopicStatus } from "@prisma/client";
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
  riskIds: z.array(z.string().min(1)).optional(),
  partnerIds: z.array(z.string().min(1)).optional()
});

const securityTopicSchema = z.object({
  title: z.string().min(1),
  category: z.nativeEnum(SecurityTopicCategory),
  status: z.nativeEnum(SecurityTopicStatus).optional(),
  description: z.string().nullable().optional(),
  frameworkRef: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  ...linksSchema.shape
});

export const securityTopicsRouter = Router();
securityTopicsRouter.use(requireAuth);

securityTopicsRouter.get("/", async (_req, res) => {
  const securityTopics = await prisma.securityTopic.findMany({
    include: {
      initiativeLinks: { include: { initiative: true } },
      riskLinks: { include: { risk: true } },
      partnerLinks: { include: { partner: true } }
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
  });
  res.json({ securityTopics });
});

securityTopicsRouter.post("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = securityTopicSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { initiativeIds, riskIds, partnerIds, ...rest } = parsed.data;
  const st = await prisma.$transaction(async (tx) => {
    return tx.securityTopic.create({
      data: {
        title: rest.title,
        category: rest.category,
        status: rest.status ?? SecurityTopicStatus.PLANNED,
        description: rest.description ?? null,
        frameworkRef: rest.frameworkRef ?? null,
        sortOrder: rest.sortOrder ?? 0,
        initiativeLinks:
          initiativeIds && initiativeIds.length > 0
            ? { createMany: { data: initiativeIds.map((initiativeId) => ({ initiativeId })) } }
            : undefined,
        riskLinks:
          riskIds && riskIds.length > 0 ? { createMany: { data: riskIds.map((riskId) => ({ riskId })) } } : undefined,
        partnerLinks:
          partnerIds && partnerIds.length > 0
            ? { createMany: { data: partnerIds.map((partnerId) => ({ partnerId })) } }
            : undefined
      },
      include: {
        initiativeLinks: { include: { initiative: true } },
        riskLinks: { include: { risk: true } },
        partnerLinks: { include: { partner: true } }
      }
    });
  });
  await logAudit(req.user!.id, "CREATED", "SECURITY_TOPIC", st.id, { title: st.title });
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.status(201).json({ securityTopic: st });
});

securityTopicsRouter.put("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = securityTopicSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { initiativeIds, riskIds, partnerIds, ...rest } = parsed.data;
  await prisma.$transaction(async (tx) => {
    if (initiativeIds !== undefined) {
      await tx.securityTopicInitiative.deleteMany({ where: { securityTopicId: id } });
      if (initiativeIds.length > 0) {
        await tx.securityTopicInitiative.createMany({
          data: initiativeIds.map((initiativeId) => ({ securityTopicId: id, initiativeId }))
        });
      }
    }
    if (riskIds !== undefined) {
      await tx.securityTopicRisk.deleteMany({ where: { securityTopicId: id } });
      if (riskIds.length > 0) {
        await tx.securityTopicRisk.createMany({
          data: riskIds.map((riskId) => ({ securityTopicId: id, riskId }))
        });
      }
    }
    if (partnerIds !== undefined) {
      await tx.securityTopicPartner.deleteMany({ where: { securityTopicId: id } });
      if (partnerIds.length > 0) {
        await tx.securityTopicPartner.createMany({
          data: partnerIds.map((partnerId) => ({ securityTopicId: id, partnerId }))
        });
      }
    }
    await tx.securityTopic.update({
      where: { id },
      data: {
        title: rest.title,
        category: rest.category,
        status: rest.status,
        description: rest.description !== undefined ? rest.description : undefined,
        frameworkRef: rest.frameworkRef !== undefined ? rest.frameworkRef : undefined,
        sortOrder: rest.sortOrder
      }
    });
  });
  const securityTopic = await prisma.securityTopic.findUnique({
    where: { id },
    include: {
      initiativeLinks: { include: { initiative: true } },
      riskLinks: { include: { risk: true } },
      partnerLinks: { include: { partner: true } }
    }
  });
  await logAudit(req.user!.id, "UPDATED", "SECURITY_TOPIC", id);
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.json({ securityTopic });
});

securityTopicsRouter.delete("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  await prisma.securityTopic.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "SECURITY_TOPIC", id);
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.status(204).send();
});
