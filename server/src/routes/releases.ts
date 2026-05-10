import { ReleaseSource } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";
import { notifyAtlasAuxiliaryChange } from "../services/hubChangeHub.js";

const releaseSchema = z.object({
  repositoryConnectionId: z.string().nullable().optional(),
  tag: z.string().min(1),
  name: z.string().min(1),
  releasedAt: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: z.nativeEnum(ReleaseSource).optional(),
  externalUrl: z.string().nullable().optional(),
  requirementIds: z.array(z.string().min(1)).optional()
});

export const releasesRouter = Router();
releasesRouter.use(requireAuth);

releasesRouter.get("/", async (_req, res) => {
  const releases = await prisma.release.findMany({
    include: {
      repositoryConnection: true,
      requirementLinks: { include: { requirement: true } }
    },
    orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }]
  });
  res.json({ releases });
});

releasesRouter.post("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = releaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { requirementIds, releasedAt, ...rest } = parsed.data;
  const rel = await prisma.$transaction(async (tx) => {
    return tx.release.create({
      data: {
        repositoryConnectionId: rest.repositoryConnectionId ?? null,
        tag: rest.tag,
        name: rest.name,
        releasedAt: releasedAt ? new Date(releasedAt) : null,
        notes: rest.notes ?? null,
        source: rest.source ?? ReleaseSource.MANUAL,
        externalUrl: rest.externalUrl ?? null,
        requirementLinks:
          requirementIds && requirementIds.length > 0
            ? { createMany: { data: requirementIds.map((requirementId) => ({ requirementId })) } }
            : undefined
      },
      include: {
        repositoryConnection: true,
        requirementLinks: { include: { requirement: true } }
      }
    });
  });
  await logAudit(req.user!.id, "CREATED", "RELEASE", rel.id, { tag: rel.tag });
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.status(201).json({ release: rel });
});

releasesRouter.put("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = releaseSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { requirementIds, releasedAt, ...rest } = parsed.data;
  await prisma.$transaction(async (tx) => {
    if (requirementIds !== undefined) {
      await tx.releaseRequirement.deleteMany({ where: { releaseId: id } });
      if (requirementIds.length > 0) {
        await tx.releaseRequirement.createMany({
          data: requirementIds.map((requirementId) => ({ releaseId: id, requirementId }))
        });
      }
    }
    const data: Record<string, unknown> = {};
    if (rest.repositoryConnectionId !== undefined) data.repositoryConnectionId = rest.repositoryConnectionId;
    if (rest.tag !== undefined) data.tag = rest.tag;
    if (rest.name !== undefined) data.name = rest.name;
    if (releasedAt !== undefined) data.releasedAt = releasedAt ? new Date(releasedAt) : null;
    if (rest.notes !== undefined) data.notes = rest.notes;
    if (rest.source !== undefined) data.source = rest.source;
    if (rest.externalUrl !== undefined) data.externalUrl = rest.externalUrl;
    await tx.release.update({
      where: { id },
      data
    });
  });
  const release = await prisma.release.findUnique({
    where: { id },
    include: {
      repositoryConnection: true,
      requirementLinks: { include: { requirement: true } }
    }
  });
  await logAudit(req.user!.id, "UPDATED", "RELEASE", id);
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.json({ release });
});

releasesRouter.delete("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  await prisma.release.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "RELEASE", id);
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.status(204).send();
});
