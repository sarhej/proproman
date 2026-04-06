import { DemandSourceType, DemandStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { findFirstUserIdNotInTenant } from "../lib/tenantUserRefs.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";

const demandSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  sourceType: z.nativeEnum(DemandSourceType),
  status: z.nativeEnum(DemandStatus),
  urgency: z.number().int().min(1).max(5).default(3),
  accountId: z.string().nullable().optional(),
  partnerId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  links: z
    .array(
      z.object({
        initiativeId: z.string().nullable().optional(),
        featureId: z.string().nullable().optional()
      })
    )
    .optional()
});

export const demandsRouter = Router();
demandsRouter.use(requireAuth);

demandsRouter.get("/", async (_req, res) => {
  const demands = await prisma.demand.findMany({
    include: {
      account: true,
      partner: true,
      owner: true,
      demandLinks: {
        include: { initiative: true, feature: true }
      }
    },
    orderBy: [{ urgency: "desc" }, { createdAt: "desc" }]
  });
  res.json({ demands });
});

demandsRouter.post("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = demandSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const payload = parsed.data;
  const bad = await findFirstUserIdNotInTenant(getTenantId(req), [payload.ownerId]);
  if (bad) {
    res.status(400).json({ error: `User is not a member of this workspace: ${bad}` });
    return;
  }
  const demand = await prisma.demand.create({
    data: {
      title: payload.title,
      description: payload.description ?? null,
      sourceType: payload.sourceType,
      status: payload.status,
      urgency: payload.urgency,
      accountId: payload.accountId ?? null,
      partnerId: payload.partnerId ?? null,
      ownerId: payload.ownerId ?? null,
      demandLinks: payload.links
        ? {
            createMany: {
              data: payload.links.map((l) => ({
                initiativeId: l.initiativeId ?? null,
                featureId: l.featureId ?? null
              }))
            }
          }
        : undefined
    },
    include: {
      account: true,
      partner: true,
      owner: true,
      demandLinks: true
    }
  });
  await logAudit(req.user!.id, "CREATED", "DEMAND", demand.id, { title: demand.title });
  res.status(201).json({ demand });
});

demandsRouter.put("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = demandSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const payload = parsed.data;
  if (payload.ownerId !== undefined) {
    const bad = await findFirstUserIdNotInTenant(getTenantId(req), [payload.ownerId]);
    if (bad) {
      res.status(400).json({ error: `User is not a member of this workspace: ${bad}` });
      return;
    }
  }
  await prisma.$transaction(async (tx) => {
    if (payload.links) {
      await tx.demandLink.deleteMany({ where: { demandId: id } });
      const rows = payload.links.map((l) => ({
        demandId: id,
        initiativeId: l.initiativeId ?? null,
        featureId: l.featureId ?? null
      }));
      if (rows.length > 0) {
        await tx.demandLink.createMany({ data: rows });
      }
    }
    await tx.demand.update({
      where: { id },
      data: {
        title: payload.title,
        description: payload.description ?? undefined,
        sourceType: payload.sourceType,
        status: payload.status,
        urgency: payload.urgency,
        accountId: payload.accountId ?? undefined,
        partnerId: payload.partnerId ?? undefined,
        ownerId: payload.ownerId ?? undefined
      }
    });
  });
  const demand = await prisma.demand.findUnique({
    where: { id },
    include: {
      account: true,
      partner: true,
      owner: true,
      demandLinks: { include: { initiative: true, feature: true } }
    }
  });
  await logAudit(req.user!.id, "UPDATED", "DEMAND", id, { title: demand?.title });
  res.json({ demand });
});

demandsRouter.delete("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.demand.findUnique({ where: { id } });
  await prisma.demand.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "DEMAND", id, { title: existing?.title });
  res.status(204).send();
});
