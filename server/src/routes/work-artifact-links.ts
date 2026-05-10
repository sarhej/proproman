import { Prisma, WorkArtifactType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceContentWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";
import { notifyAtlasAuxiliaryChange, notifyHubChange } from "../services/hubChangeHub.js";

const linkSchema = z.object({
  repositoryConnectionId: z.string().nullable().optional(),
  featureId: z.string().nullable().optional(),
  requirementId: z.string().nullable().optional(),
  artifactType: z.nativeEnum(WorkArtifactType),
  url: z.string().url(),
  externalId: z.string().nullable().optional(),
  pinnedRevision: z.string().nullable().optional(),
  title: z.string().nullable().optional()
});

export const workArtifactLinksRouter = Router();
workArtifactLinksRouter.use(requireAuth);

workArtifactLinksRouter.get("/", async (req, res) => {
  const featureId = typeof req.query.featureId === "string" ? req.query.featureId : undefined;
  const requirementId = typeof req.query.requirementId === "string" ? req.query.requirementId : undefined;
  const where: Record<string, unknown> = {};
  if (featureId) where.featureId = featureId;
  if (requirementId) where.requirementId = requirementId;
  const workArtifactLinks = await prisma.workArtifactLink.findMany({
    where,
    include: { repositoryConnection: true, feature: true, requirement: true },
    orderBy: { createdAt: "desc" }
  });
  res.json({ workArtifactLinks });
});

workArtifactLinksRouter.post("/", requireWorkspaceContentWrite(), async (req, res) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const p = parsed.data;
  if (!p.featureId && !p.requirementId) {
    res.status(400).json({ error: "featureId or requirementId required" });
    return;
  }
  const row = await prisma.workArtifactLink.create({
    data: {
      repositoryConnectionId: p.repositoryConnectionId ?? null,
      featureId: p.featureId ?? null,
      requirementId: p.requirementId ?? null,
      artifactType: p.artifactType,
      url: p.url,
      externalId: p.externalId ?? null,
      pinnedRevision: p.pinnedRevision ?? null,
      title: p.title ?? null
    },
    include: { repositoryConnection: true }
  });
  await logAudit(req.user!.id, "CREATED", "WORK_ARTIFACT_LINK", row.id);
  await bumpFeatureRequirementHub(row.featureId, row.requirementId, getTenantId(req));
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.status(201).json({ workArtifactLink: row });
});

workArtifactLinksRouter.put("/:id", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = linkSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const p = parsed.data;
  const data: Prisma.WorkArtifactLinkUncheckedUpdateInput = {};
  if (p.repositoryConnectionId !== undefined) data.repositoryConnectionId = p.repositoryConnectionId;
  if (p.featureId !== undefined) data.featureId = p.featureId;
  if (p.requirementId !== undefined) data.requirementId = p.requirementId;
  if (p.artifactType !== undefined) data.artifactType = p.artifactType;
  if (p.url !== undefined) data.url = p.url;
  if (p.externalId !== undefined) data.externalId = p.externalId;
  if (p.pinnedRevision !== undefined) data.pinnedRevision = p.pinnedRevision;
  if (p.title !== undefined) data.title = p.title;
  const row = await prisma.workArtifactLink.update({
    where: { id },
    data,
    include: { repositoryConnection: true }
  });
  await logAudit(req.user!.id, "UPDATED", "WORK_ARTIFACT_LINK", id);
  await bumpFeatureRequirementHub(row.featureId, row.requirementId, getTenantId(req));
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.json({ workArtifactLink: row });
});

workArtifactLinksRouter.delete("/:id", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const prev = await prisma.workArtifactLink.findUnique({
    where: { id },
    select: { featureId: true, requirementId: true }
  });
  await prisma.workArtifactLink.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "WORK_ARTIFACT_LINK", id);
  if (prev) await bumpFeatureRequirementHub(prev.featureId, prev.requirementId, getTenantId(req));
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.status(204).send();
});

async function bumpFeatureRequirementHub(
  featureId: string | null,
  requirementId: string | null,
  tenantId: string
): Promise<void> {
  if (requirementId) {
    const r = await prisma.requirement.findUnique({
      where: { id: requirementId },
      select: { feature: { select: { initiativeId: true } } }
    });
    notifyHubChange({
      tenantId,
      entityType: "REQUIREMENT",
      operation: "UPDATE",
      entityId: requirementId,
      initiativeId: r?.feature.initiativeId ?? null
    });
    return;
  }
  if (featureId) {
    const f = await prisma.feature.findUnique({
      where: { id: featureId },
      select: { initiativeId: true }
    });
    notifyHubChange({
      tenantId,
      entityType: "FEATURE",
      operation: "UPDATE",
      entityId: featureId,
      initiativeId: f?.initiativeId ?? null
    });
  }
}
