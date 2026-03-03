import { DemandSourceType, DemandStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

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

demandsRouter.post("/", requireRole(UserRole.ADMIN), async (req, res) => {
  const parsed = demandSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const payload = parsed.data;
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
  res.status(201).json({ demand });
});

demandsRouter.put("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  const parsed = demandSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const payload = parsed.data;
  await prisma.$transaction(async (tx) => {
    if (payload.links) {
      await tx.demandLink.deleteMany({ where: { demandId: id } });
      await tx.demandLink.createMany({
        data: payload.links.map((l) => ({
          demandId: id,
          initiativeId: l.initiativeId ?? null,
          featureId: l.featureId ?? null
        }))
      });
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
  res.json({ demand });
});

demandsRouter.delete("/:id", requireRole(UserRole.ADMIN), async (req, res) => {
  const id = String(req.params.id);
  await prisma.demand.delete({ where: { id } });
  res.status(204).send();
});
