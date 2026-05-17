import { AtlasCuratorProposalStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import {
  applyAcceptedProposal,
  curatorPayloadToCreateData,
  ProposalApplyError,
  type CuratorApplyTx
} from "../atlasCurator/applyProposal.js";
import { curatorProposalPayloadSchema, fieldIsLocked } from "../atlasCurator/schemas.js";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";
import { notifyAtlasAuxiliaryChange } from "../services/hubChangeHub.js";

const listQuery = z.object({
  status: z.nativeEnum(AtlasCuratorProposalStatus).optional()
});

const reviewBody = z.object({
  reviewReason: z.string().nullable().optional(),
  proposedValue: z.unknown().optional()
});

export const atlasProposalsRouter = Router();
atlasProposalsRouter.use(requireAuth);

const proposalInclude = {
  architectureTopic: { select: { id: true, slug: true, title: true, lockedFields: true } }
} as const;

atlasProposalsRouter.get("/", async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const proposals = await prisma.atlasCuratorProposal.findMany({
    where: parsed.data.status ? { status: parsed.data.status } : undefined,
    include: proposalInclude,
    orderBy: [{ createdAt: "desc" }]
  });
  res.json({ proposals });
});

atlasProposalsRouter.post("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = curatorProposalPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const payload = parsed.data;
  const topic = await prisma.architectureTopic.findUnique({
    where: { id: payload.architectureTopicId },
    select: { id: true, lockedFields: true }
  });
  if (!topic) {
    res.status(404).json({ error: "Architecture topic not found" });
    return;
  }
  if (
    payload.proposalType === "TOPIC_LAYER_PATCH" &&
    fieldIsLocked(topic.lockedFields, payload.proposedValue.field)
  ) {
    res.status(409).json({ error: "Target field is human-locked; proposal rejected at intake" });
    return;
  }

  const proposal = await prisma.atlasCuratorProposal.create({
    data: curatorPayloadToCreateData(payload),
    include: proposalInclude
  });
  await logAudit(req.user!.id, "CREATED", "ATLAS_CURATOR_PROPOSAL", proposal.id, {
    proposalType: proposal.proposalType
  });
  res.status(201).json({ proposal });
});

atlasProposalsRouter.post("/:id/accept", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = reviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.atlasCuratorProposal.findUnique({ where: { id } });
      if (!existing) throw new ProposalApplyError("Proposal not found", "NOT_FOUND");
      await applyAcceptedProposal(tx as unknown as CuratorApplyTx, existing, parsed.data.proposedValue);
      await tx.atlasCuratorProposal.update({
        where: { id },
        data: {
          status: AtlasCuratorProposalStatus.ACCEPTED,
          reviewReason: parsed.data.reviewReason ?? null,
          reviewerId: req.user!.id,
          reviewedAt: new Date(),
          proposedValue:
            parsed.data.proposedValue !== undefined
              ? (parsed.data.proposedValue as Prisma.InputJsonValue)
              : undefined
        }
      });
    });
  } catch (err) {
    if (err instanceof ProposalApplyError) {
      const status =
        err.code === "NOT_FOUND" ? 404 : err.code === "LOCKED" ? 409 : err.code === "WRONG_STATUS" ? 409 : 400;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
    throw err;
  }

  const proposal = await prisma.atlasCuratorProposal.findUnique({
    where: { id },
    include: proposalInclude
  });
  notifyAtlasAuxiliaryChange(getTenantId(req));
  await logAudit(req.user!.id, "UPDATED", "ATLAS_CURATOR_PROPOSAL", id, { action: "accept" });
  res.json({ proposal });
});

atlasProposalsRouter.post("/:id/reject", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = reviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.atlasCuratorProposal.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }
  if (existing.status !== AtlasCuratorProposalStatus.PENDING) {
    res.status(409).json({ error: "Proposal is not pending" });
    return;
  }

  const proposal = await prisma.atlasCuratorProposal.update({
    where: { id },
    data: {
      status: AtlasCuratorProposalStatus.REJECTED,
      reviewReason: parsed.data.reviewReason ?? null,
      reviewerId: req.user!.id,
      reviewedAt: new Date()
    },
    include: proposalInclude
  });
  await logAudit(req.user!.id, "UPDATED", "ATLAS_CURATOR_PROPOSAL", id, { action: "reject" });
  res.json({ proposal });
});
