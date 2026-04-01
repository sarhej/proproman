import { FeatureStatus, Prisma, StoryType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { findFirstUserIdNotInTenant } from "../lib/tenantUserRefs.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceContentWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";
import { featureReorderSchema, labelsSchema } from "./schemas.js";

const featureStatusValues = ["IDEA", "PLANNED", "IN_PROGRESS", "BUSINESS_APPROVAL", "DONE"] as const;
const featureStatusSchema = z.enum(featureStatusValues);

export const featureSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  acceptanceCriteria: z.string().nullable().optional(),
  labels: labelsSchema,
  storyPoints: z.number().int().min(0).nullable().optional(),
  storyType: z.nativeEnum(StoryType).nullable().optional(),
  ownerId: z.string().nullable().optional(),
  status: featureStatusSchema.default("IDEA"),
  sortOrder: z.number().int().default(0)
});

export const featuresRouter = Router();
featuresRouter.use(requireAuth);

featuresRouter.post("/reorder", requireWorkspaceContentWrite(), async (req, res) => {
  const parsed = featureReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (parsed.data.length === 0) {
    res.status(400).json({ error: "Empty reorder payload" });
    return;
  }
  const payloadIds = parsed.data.map((u) => u.id);
  if (new Set(payloadIds).size !== payloadIds.length) {
    res.status(400).json({ error: "Duplicate feature ids in reorder payload" });
    return;
  }
  const first = await prisma.feature.findUnique({
    where: { id: parsed.data[0].id },
    select: { initiativeId: true }
  });
  if (!first) {
    res.status(400).json({ error: "Unknown feature" });
    return;
  }
  const siblings = await prisma.feature.findMany({
    where: { initiativeId: first.initiativeId },
    select: { id: true }
  });
  const expected = new Set(siblings.map((s) => s.id));
  if (expected.size !== payloadIds.length || !payloadIds.every((id) => expected.has(id))) {
    res.status(400).json({ error: "Payload must list every feature in the initiative exactly once" });
    return;
  }
  await prisma.$transaction(
    parsed.data.map((u) =>
      prisma.feature.update({
        where: { id: u.id },
        data: { sortOrder: u.sortOrder }
      })
    )
  );
  res.json({ ok: true });
});

featuresRouter.post("/:initiativeId", requireWorkspaceContentWrite(), async (req, res) => {
  const initiativeId = String(req.params.initiativeId);
  const parsed = featureSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = getTenantId(req);
  const badOwner = await findFirstUserIdNotInTenant(tenantId, [parsed.data.ownerId]);
  if (badOwner) {
    res.status(400).json({ error: `User is not a member of this workspace: ${badOwner}` });
    return;
  }
  const feature = await prisma.feature.create({
    data: {
      initiativeId,
      ...parsed.data,
      description: parsed.data.description ?? null,
      acceptanceCriteria: parsed.data.acceptanceCriteria ?? null,
      labels: parsed.data.labels === null ? Prisma.JsonNull : ((parsed.data.labels ?? undefined) as Prisma.InputJsonValue),
      storyPoints: parsed.data.storyPoints ?? null,
      storyType: parsed.data.storyType ?? null,
      ownerId: parsed.data.ownerId ?? null
    },
    include: { owner: true }
  });
  await logAudit(req.user!.id, "CREATED", "FEATURE", feature.id, { title: feature.title });
  res.status(201).json({ feature });
});

featuresRouter.put("/:id", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = featureSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (parsed.data.ownerId !== undefined) {
    const tenantId = getTenantId(req);
    const badOwner = await findFirstUserIdNotInTenant(tenantId, [parsed.data.ownerId]);
    if (badOwner) {
      res.status(400).json({ error: `User is not a member of this workspace: ${badOwner}` });
      return;
    }
  }
  const data: Parameters<typeof prisma.feature.update>[0]["data"] = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description ?? null;
  if (parsed.data.acceptanceCriteria !== undefined) data.acceptanceCriteria = parsed.data.acceptanceCriteria ?? null;
  if (parsed.data.labels !== undefined) data.labels = parsed.data.labels === null ? Prisma.JsonNull : (parsed.data.labels as Prisma.InputJsonValue);
  if (parsed.data.storyPoints !== undefined) data.storyPoints = parsed.data.storyPoints ?? null;
  if (parsed.data.storyType !== undefined) data.storyType = parsed.data.storyType ?? null;
  if (parsed.data.ownerId !== undefined) data.ownerId = parsed.data.ownerId ?? null;
  if (parsed.data.status !== undefined) data.status = parsed.data.status as FeatureStatus;
  if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;
  const feature = await prisma.feature.update({
    where: { id },
    data,
    include: { owner: true }
  });
  await logAudit(req.user!.id, "UPDATED", "FEATURE", feature.id);
  res.json({ feature });
});

featuresRouter.delete("/:id", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  await prisma.feature.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "FEATURE", id);
  res.status(204).send();
});
