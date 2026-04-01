import { CampaignStatus, CampaignType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { findFirstUserIdNotInTenant } from "../lib/tenantUserRefs.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenantCampaignWrite } from "../middleware/workspaceAuth.js";
import { logAudit } from "../services/audit.js";

const campaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  type: z.nativeEnum(CampaignType),
  status: z.nativeEnum(CampaignStatus).default(CampaignStatus.DRAFT),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  budget: z.number().nullable().optional(),
  ownerId: z.string().nullable().optional()
});

const campaignInclude = {
  owner: true,
  assets: {
    include: { persona: true },
    orderBy: { createdAt: "asc" as const }
  },
  links: {
    include: {
      initiative: { include: { domain: true } },
      feature: true,
      account: true,
      partner: true
    }
  }
};

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

campaignsRouter.get("/", async (_req, res) => {
  const campaigns = await prisma.campaign.findMany({
    include: campaignInclude,
    orderBy: { createdAt: "desc" }
  });
  res.json({ campaigns });
});

campaignsRouter.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: campaignInclude
  });
  if (!campaign) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ campaign });
});

campaignsRouter.post("/", requireTenantCampaignWrite(), async (req, res) => {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const bad = await findFirstUserIdNotInTenant(getTenantId(req), [parsed.data.ownerId]);
  if (bad) {
    res.status(400).json({ error: `User is not a member of this workspace: ${bad}` });
    return;
  }
  const { startDate, endDate, ...rest } = parsed.data;
  const campaign = await prisma.campaign.create({
    data: {
      ...rest,
      description: rest.description ?? null,
      ownerId: rest.ownerId ?? null,
      budget: rest.budget ?? null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null
    },
    include: campaignInclude
  });
  await logAudit(req.user!.id, "CREATED", "CAMPAIGN", campaign.id, { name: campaign.name });
  res.status(201).json({ campaign });
});

campaignsRouter.put("/:id", requireTenantCampaignWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = campaignSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (parsed.data.ownerId !== undefined) {
    const bad = await findFirstUserIdNotInTenant(getTenantId(req), [parsed.data.ownerId]);
    if (bad) {
      res.status(400).json({ error: `User is not a member of this workspace: ${bad}` });
      return;
    }
  }
  const { startDate, endDate, ...rest } = parsed.data;
  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      ...rest,
      description: rest.description ?? undefined,
      ownerId: rest.ownerId ?? undefined,
      budget: rest.budget ?? undefined,
      startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : undefined,
      endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : undefined
    },
    include: campaignInclude
  });
  await logAudit(req.user!.id, "UPDATED", "CAMPAIGN", campaign.id);
  res.json({ campaign });
});

campaignsRouter.delete("/:id", requireTenantCampaignWrite(), async (req, res) => {
  const id = String(req.params.id);
  await prisma.campaign.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "CAMPAIGN", id);
  res.status(204).send();
});
