import { AttachmentLinkRole, AttachmentStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceContentWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";
import { ATTACHMENT_MAX_LINKS_PER_ENTITY } from "../attachments/constants.js";

const linkSchema = z
  .object({
    attachmentId: z.string().min(1),
    featureId: z.string().nullable().optional(),
    requirementId: z.string().nullable().optional(),
    initiativeId: z.string().nullable().optional(),
    demandId: z.string().nullable().optional(),
    intakeSessionId: z.string().nullable().optional(),
    role: z.nativeEnum(AttachmentLinkRole).optional()
  })
  .refine(
    (d) =>
      Boolean(d.featureId || d.requirementId || d.initiativeId || d.demandId || d.intakeSessionId),
    { message: "At least one target id is required" }
  );

export const attachmentLinksRouter = Router();
attachmentLinksRouter.use(requireAuth);

attachmentLinksRouter.get("/", async (req, res) => {
  const where: Prisma.AttachmentLinkWhereInput = {};
  if (typeof req.query.featureId === "string") where.featureId = req.query.featureId;
  if (typeof req.query.requirementId === "string") where.requirementId = req.query.requirementId;
  if (typeof req.query.initiativeId === "string") where.initiativeId = req.query.initiativeId;
  if (typeof req.query.demandId === "string") where.demandId = req.query.demandId;
  if (typeof req.query.intakeSessionId === "string") where.intakeSessionId = req.query.intakeSessionId;
  if (typeof req.query.attachmentId === "string") where.attachmentId = req.query.attachmentId;

  const links = await prisma.attachmentLink.findMany({
    where,
    include: {
      attachment: {
        include: {
          createdBy: { select: { id: true, name: true, email: true } }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
  // Hide retired/purged/pending from entity panels (admin library uses attachments list)
  const filtered = links.filter((l) => l.attachment.status === AttachmentStatus.ACTIVE);
  res.json({ attachmentLinks: filtered });
});

attachmentLinksRouter.post("/", requireWorkspaceContentWrite(), async (req, res) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const p = parsed.data;
  const attachment = await prisma.attachment.findFirst({
    where: { id: p.attachmentId, status: AttachmentStatus.ACTIVE }
  });
  if (!attachment) {
    res.status(404).json({ error: "Active attachment not found" });
    return;
  }

  const quotaWhere: Prisma.AttachmentLinkWhereInput = {};
  if (p.featureId) quotaWhere.featureId = p.featureId;
  else if (p.requirementId) quotaWhere.requirementId = p.requirementId;
  else if (p.initiativeId) quotaWhere.initiativeId = p.initiativeId;
  else if (p.demandId) quotaWhere.demandId = p.demandId;
  else if (p.intakeSessionId) quotaWhere.intakeSessionId = p.intakeSessionId;
  const count = await prisma.attachmentLink.count({ where: quotaWhere });
  if (count >= ATTACHMENT_MAX_LINKS_PER_ENTITY) {
    res.status(400).json({
      error: `Maximum of ${ATTACHMENT_MAX_LINKS_PER_ENTITY} attachments per entity`
    });
    return;
  }

  const existing = await prisma.attachmentLink.findFirst({
    where: {
      attachmentId: p.attachmentId,
      featureId: p.featureId ?? null,
      requirementId: p.requirementId ?? null,
      initiativeId: p.initiativeId ?? null,
      demandId: p.demandId ?? null,
      intakeSessionId: p.intakeSessionId ?? null
    }
  });
  if (existing) {
    res.status(200).json({ attachmentLink: existing, alreadyLinked: true });
    return;
  }

  const row = await prisma.attachmentLink.create({
    data: {
      tenantId: getTenantId(req),
      attachmentId: p.attachmentId,
      featureId: p.featureId ?? null,
      requirementId: p.requirementId ?? null,
      initiativeId: p.initiativeId ?? null,
      demandId: p.demandId ?? null,
      intakeSessionId: p.intakeSessionId ?? null,
      role: p.role ?? AttachmentLinkRole.EVIDENCE,
      createdByUserId: req.user!.id
    },
    include: { attachment: true }
  });
  await logAudit(req.user!.id, "CREATED", "ATTACHMENT_LINK", row.id, {
    attachmentId: row.attachmentId
  });
  res.status(201).json({ attachmentLink: row });
});

/** Unlink only — does not delete the Attachment blob. */
attachmentLinksRouter.delete("/:id", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const prev = await prisma.attachmentLink.findFirst({ where: { id } });
  if (!prev) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await prisma.attachmentLink.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "ATTACHMENT_LINK", id, {
    attachmentId: prev.attachmentId,
    unlinkOnly: true
  });
  res.status(204).send();
});
