import { DesignArtifactProvider, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceContentWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";
import { notifyAtlasAuxiliaryChange, notifyHubChange } from "../services/hubChangeHub.js";

const linkSchema = z.object({
  featureId: z.string().nullable().optional(),
  requirementId: z.string().nullable().optional(),
  provider: z.nativeEnum(DesignArtifactProvider),
  url: z.string().url(),
  nodeRef: z.string().nullable().optional(),
  title: z.string().nullable().optional()
});

export const designArtifactLinksRouter = Router();
designArtifactLinksRouter.use(requireAuth);

designArtifactLinksRouter.get("/", async (req, res) => {
  const featureId = typeof req.query.featureId === "string" ? req.query.featureId : undefined;
  const requirementId = typeof req.query.requirementId === "string" ? req.query.requirementId : undefined;
  const where: Record<string, unknown> = {};
  if (featureId) where.featureId = featureId;
  if (requirementId) where.requirementId = requirementId;
  const designArtifactLinks = await prisma.designArtifactLink.findMany({
    where,
    include: { feature: true, requirement: true },
    orderBy: { createdAt: "desc" }
  });
  res.json({ designArtifactLinks });
});

designArtifactLinksRouter.post("/", requireWorkspaceContentWrite(), async (req, res) => {
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
  const row = await prisma.designArtifactLink.create({
    data: {
      featureId: p.featureId ?? null,
      requirementId: p.requirementId ?? null,
      provider: p.provider,
      url: p.url,
      nodeRef: p.nodeRef ?? null,
      title: p.title ?? null
    }
  });
  await logAudit(req.user!.id, "CREATED", "DESIGN_ARTIFACT_LINK", row.id);
  await bumpHub(row.featureId, row.requirementId, getTenantId(req));
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.status(201).json({ designArtifactLink: row });
});

designArtifactLinksRouter.put("/:id", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = linkSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const p = parsed.data;
  const data: Prisma.DesignArtifactLinkUncheckedUpdateInput = {};
  if (p.featureId !== undefined) data.featureId = p.featureId;
  if (p.requirementId !== undefined) data.requirementId = p.requirementId;
  if (p.provider !== undefined) data.provider = p.provider;
  if (p.url !== undefined) data.url = p.url;
  if (p.nodeRef !== undefined) data.nodeRef = p.nodeRef;
  if (p.title !== undefined) data.title = p.title;
  const row = await prisma.designArtifactLink.update({
    where: { id },
    data
  });
  await logAudit(req.user!.id, "UPDATED", "DESIGN_ARTIFACT_LINK", id);
  await bumpHub(row.featureId, row.requirementId, getTenantId(req));
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.json({ designArtifactLink: row });
});

designArtifactLinksRouter.delete("/:id", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const prev = await prisma.designArtifactLink.findUnique({
    where: { id },
    select: { featureId: true, requirementId: true }
  });
  await prisma.designArtifactLink.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "DESIGN_ARTIFACT_LINK", id);
  if (prev) await bumpHub(prev.featureId, prev.requirementId, getTenantId(req));
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.status(204).send();
});

async function bumpHub(featureId: string | null, requirementId: string | null, tenantId: string): Promise<void> {
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
