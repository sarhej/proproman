import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenantCampaignWrite } from "../middleware/workspaceAuth.js";
import { logAudit } from "../services/audit.js";

const linkSchema = z.object({
  campaignId: z.string().min(1),
  initiativeId: z.string().nullable().optional(),
  featureId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  partnerId: z.string().nullable().optional()
});

export const campaignLinksRouter = Router();
campaignLinksRouter.use(requireAuth);

campaignLinksRouter.get("/", async (req, res) => {
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const links = await prisma.campaignLink.findMany({
    where: campaignId ? { campaignId } : undefined,
    include: {
      campaign: true,
      initiative: { include: { domain: true } },
      feature: true,
      account: true,
      partner: true
    },
    orderBy: { id: "asc" }
  });
  res.json({ links });
});

campaignLinksRouter.post("/", requireTenantCampaignWrite(), async (req, res) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const link = await prisma.campaignLink.create({
    data: {
      campaignId: parsed.data.campaignId,
      initiativeId: parsed.data.initiativeId ?? null,
      featureId: parsed.data.featureId ?? null,
      accountId: parsed.data.accountId ?? null,
      partnerId: parsed.data.partnerId ?? null
    },
    include: {
      campaign: true,
      initiative: { include: { domain: true } },
      feature: true,
      account: true,
      partner: true
    }
  });
  await logAudit(req.user!.id, "CREATED", "CAMPAIGN_LINK", link.id, {
    campaignId: link.campaignId,
    initiativeId: link.initiativeId
  });
  res.status(201).json({ link });
});

campaignLinksRouter.delete("/:id", requireTenantCampaignWrite(), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.campaignLink.findUnique({ where: { id } });
  await prisma.campaignLink.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "CAMPAIGN_LINK", id, {
    campaignId: existing?.campaignId,
    initiativeId: existing?.initiativeId
  });
  res.status(204).send();
});
