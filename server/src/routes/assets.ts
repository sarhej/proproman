import { AssetStatus, AssetType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireMarketingAccess } from "../middleware/auth.js";

const assetSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  type: z.nativeEnum(AssetType),
  status: z.nativeEnum(AssetStatus).default(AssetStatus.DRAFT),
  url: z.string().nullable().optional(),
  personaId: z.string().nullable().optional(),
  partnerId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional()
});

export const assetsRouter = Router();
assetsRouter.use(requireAuth);

assetsRouter.get("/", async (req, res) => {
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const assets = await prisma.asset.findMany({
    where: campaignId ? { campaignId } : undefined,
    include: { persona: true, campaign: true },
    orderBy: { createdAt: "asc" }
  });
  res.json({ assets });
});

assetsRouter.post("/", requireMarketingAccess(), async (req, res) => {
  const parsed = assetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const asset = await prisma.asset.create({
    data: {
      ...parsed.data,
      description: parsed.data.description ?? null,
      url: parsed.data.url ?? null,
      personaId: parsed.data.personaId ?? null,
      partnerId: parsed.data.partnerId ?? null,
      accountId: parsed.data.accountId ?? null
    },
    include: { persona: true }
  });
  res.status(201).json({ asset });
});

assetsRouter.put("/:id", requireMarketingAccess(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = assetSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const asset = await prisma.asset.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? undefined,
      type: parsed.data.type,
      status: parsed.data.status,
      url: parsed.data.url ?? undefined,
      personaId: parsed.data.personaId ?? undefined,
      partnerId: parsed.data.partnerId ?? undefined,
      accountId: parsed.data.accountId ?? undefined
    },
    include: { persona: true }
  });
  res.json({ asset });
});

assetsRouter.delete("/:id", requireMarketingAccess(), async (req, res) => {
  const id = String(req.params.id);
  await prisma.asset.delete({ where: { id } });
  res.status(204).send();
});
