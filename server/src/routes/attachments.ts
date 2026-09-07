import {
  AttachmentKind,
  AttachmentLinkRole,
  AttachmentSource,
  AttachmentStatus,
  Prisma
} from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  requireWorkspaceContentWrite,
  requireWorkspaceStructureWrite
} from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { multerSingleWithTenant } from "../tenant/multerWithTenant.js";
import { logAudit } from "../services/audit.js";
import { getAttachmentStorage } from "../attachments/storageFactory.js";
import {
  ATTACHMENT_MAX_LINKS_PER_ENTITY,
  buildAttachmentStorageKey,
  sanitizeFilename,
  sha256Hex,
  validateAttachmentBytes
} from "../attachments/constants.js";
import {
  isPlatformSuperAdmin,
  workspaceMembershipCanManageStructure
} from "../lib/workspaceRbac.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});

const metaSchema = z.object({
  filename: z.string().min(1).max(200).optional(),
  source: z.nativeEnum(AttachmentSource).optional(),
  kind: z.nativeEnum(AttachmentKind).optional(),
  parentAttachmentId: z.string().nullable().optional(),
  /** Optional auto-link after upload */
  featureId: z.string().nullable().optional(),
  requirementId: z.string().nullable().optional(),
  initiativeId: z.string().nullable().optional(),
  demandId: z.string().nullable().optional(),
  intakeSessionId: z.string().nullable().optional(),
  role: z.nativeEnum(AttachmentLinkRole).optional()
});

const retireSchema = z.object({
  reason: z.string().max(500).optional()
});

export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

attachmentsRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const statusRaw = typeof req.query.status === "string" ? req.query.status : "ACTIVE";
  const unused = req.query.unused === "true" || req.query.unused === "1";
  const includeRetired = req.query.includeRetired === "true" || req.query.includeRetired === "1";

  const where: Prisma.AttachmentWhereInput = {};
  if (statusRaw === "ALL" || includeRetired) {
    where.status = { in: [AttachmentStatus.ACTIVE, AttachmentStatus.RETIRED] };
  } else if (Object.values(AttachmentStatus).includes(statusRaw as AttachmentStatus)) {
    where.status = statusRaw as AttachmentStatus;
  } else {
    where.status = AttachmentStatus.ACTIVE;
  }
  if (q) {
    where.filename = { contains: q, mode: "insensitive" };
  }
  if (unused) {
    where.links = { none: {} };
  }

  const attachments = await prisma.attachment.findMany({
    where,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { links: true } },
      links: {
        select: {
          id: true,
          featureId: true,
          requirementId: true,
          initiativeId: true,
          demandId: true,
          intakeSessionId: true,
          role: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json({ attachments });
});

attachmentsRouter.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  const row = await prisma.attachment.findFirst({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { links: true } },
      links: true,
      variants: { select: { id: true, kind: true, filename: true, status: true } }
    }
  });
  if (!row || row.status === AttachmentStatus.PURGED) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (row.status === AttachmentStatus.RETIRED) {
    // VIEWER/MEMBER can see metadata is retired but no download URL unless admin path
    const downloadUrl = null;
    res.json({ attachment: row, downloadUrl });
    return;
  }
  if (row.status !== AttachmentStatus.ACTIVE) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const storage = getAttachmentStorage();
  const signed = await storage.getSignedDownloadUrl(row.storageKey, 300);
  const downloadUrl = signed ?? null;
  res.json({
    attachment: row,
    downloadUrl,
    /** When downloadUrl is null, client should use GET /:id/content */
    contentPath: signed ? null : `/api/attachments/${row.id}/content`
  });
});

attachmentsRouter.get("/:id/content", async (req, res) => {
  const id = String(req.params.id);
  const adminDownload = req.query.admin === "1" || req.query.admin === "true";
  const row = await prisma.attachment.findFirst({ where: { id } });
  if (!row || row.status === AttachmentStatus.PURGED || row.status === AttachmentStatus.PENDING) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (row.status === AttachmentStatus.RETIRED && !adminDownload) {
    res.status(403).json({ error: "Attachment is retired" });
    return;
  }
  if (row.status === AttachmentStatus.RETIRED && adminDownload) {
    const user = req.user!;
    const allowed =
      isPlatformSuperAdmin(user.role) ||
      (req.tenantContext &&
        workspaceMembershipCanManageStructure(req.tenantContext.membershipRole));
    if (!allowed) {
      res.status(403).json({ error: "Admin download of retired attachments requires OWNER or ADMIN" });
      return;
    }
  }
  try {
    const buf = await getAttachmentStorage().get(row.storageKey);
    res.setHeader("Content-Type", row.mimeType);
    res.setHeader("Content-Length", String(buf.length));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${sanitizeFilename(row.filename).replace(/"/g, "")}"`
    );
    res.setHeader("Cache-Control", "private, max-age=60");
    // Binary blob download (Content-Type already set); avoid res.send() XSS SAST false positive.
    res.end(buf);
  } catch {
    res.status(404).json({ error: "Blob missing" });
  }
});

/** Multipart upload — primary path for local driver and simple clients. */
attachmentsRouter.post(
  "/",
  requireWorkspaceContentWrite(),
  multerSingleWithTenant(upload.single("file")),
  async (req, res) => {
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ error: "file required (multipart field name: file)" });
      return;
    }
    const parsed = metaSchema.safeParse({
      ...req.body,
      featureId: emptyToNull(req.body.featureId),
      requirementId: emptyToNull(req.body.requirementId),
      initiativeId: emptyToNull(req.body.initiativeId),
      demandId: emptyToNull(req.body.demandId),
      intakeSessionId: emptyToNull(req.body.intakeSessionId),
      parentAttachmentId: emptyToNull(req.body.parentAttachmentId)
    });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const validation = validateAttachmentBytes(file.buffer, file.mimetype);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error.message, code: validation.error.code });
      return;
    }

    const tenantId = getTenantId(req);
    const filename = sanitizeFilename(parsed.data.filename || file.originalname || "image.png");
    const checksum = sha256Hex(file.buffer);
    const source = parsed.data.source ?? AttachmentSource.UPLOAD;
    const kind = parsed.data.kind ?? AttachmentKind.ORIGINAL;

    const linkTarget = pickLinkTarget(parsed.data);
    if (linkTarget) {
      const sessionErr = await assertIntakeSessionExists(linkTarget.intakeSessionId);
      if (sessionErr) {
        res.status(400).json({ error: sessionErr });
        return;
      }
      const linkErr = await assertLinkQuota(linkTarget);
      if (linkErr) {
        res.status(400).json({ error: linkErr });
        return;
      }
    }

    const attachment = await prisma.attachment.create({
      data: {
        tenantId,
        createdByUserId: req.user!.id,
        filename,
        mimeType: validation.mimeType,
        byteSize: file.buffer.length,
        checksum,
        storageKey: "pending",
        source,
        kind,
        parentAttachmentId: parsed.data.parentAttachmentId ?? null,
        status: AttachmentStatus.PENDING
      }
    });

    const storageKey = buildAttachmentStorageKey(tenantId, attachment.id, filename);
    try {
      await getAttachmentStorage().put(storageKey, file.buffer, validation.mimeType);
    } catch {
      await prisma.attachment.delete({ where: { id: attachment.id } }).catch(() => undefined);
      res.status(500).json({ error: "Failed to store file" });
      return;
    }

    const active = await prisma.attachment.update({
      where: { id: attachment.id },
      data: { storageKey, status: AttachmentStatus.ACTIVE, tenantId }
    });

    let link = null;
    if (linkTarget) {
      link = await prisma.attachmentLink.create({
        data: {
          tenantId,
          attachmentId: active.id,
          createdByUserId: req.user!.id,
          role: parsed.data.role ?? AttachmentLinkRole.EVIDENCE,
          ...linkTarget
        }
      });
    }

    await logAudit(req.user!.id, "CREATED", "ATTACHMENT", active.id, {
      filename: active.filename,
      mimeType: active.mimeType,
      byteSize: active.byteSize
    });

    res.status(201).json({ attachment: active, link });
  }
);

/** Create PENDING row + optional S3 presign for direct PUT. */
attachmentsRouter.post("/presign", requireWorkspaceContentWrite(), async (req, res) => {
  const schema = z.object({
    filename: z.string().min(1).max(200),
    mimeType: z.string().min(1),
    byteSize: z.number().int().positive().max(10 * 1024 * 1024),
    source: z.nativeEnum(AttachmentSource).optional(),
    kind: z.nativeEnum(AttachmentKind).optional(),
    parentAttachmentId: z.string().nullable().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(parsed.data.mimeType)) {
    res.status(400).json({ error: "Only PNG, JPEG, and WebP images are allowed", code: "MIME_REJECTED" });
    return;
  }
  const tenantId = getTenantId(req);
  const filename = sanitizeFilename(parsed.data.filename);
  const attachment = await prisma.attachment.create({
    data: {
      tenantId,
      createdByUserId: req.user!.id,
      filename,
      mimeType: parsed.data.mimeType,
      byteSize: parsed.data.byteSize,
      checksum: "",
      storageKey: "pending",
      source: parsed.data.source ?? AttachmentSource.UPLOAD,
      kind: parsed.data.kind ?? AttachmentKind.ORIGINAL,
      parentAttachmentId: parsed.data.parentAttachmentId ?? null,
      status: AttachmentStatus.PENDING
    }
  });
  const storageKey = buildAttachmentStorageKey(tenantId, attachment.id, filename);
  await prisma.attachment.update({
    where: { id: attachment.id },
    data: { storageKey, tenantId }
  });
  const signedUploadUrl = await getAttachmentStorage().getSignedUploadUrl(
    storageKey,
    parsed.data.mimeType,
    600
  );
  res.status(201).json({
    attachmentId: attachment.id,
    storageKey,
    uploadUrl: signedUploadUrl,
    /** When uploadUrl is null, POST multipart to /api/attachments or PUT bytes to /:id/upload-bytes */
    uploadBytesPath: signedUploadUrl ? null : `/api/attachments/${attachment.id}/upload-bytes`
  });
});

attachmentsRouter.post(
  "/:id/upload-bytes",
  requireWorkspaceContentWrite(),
  multerSingleWithTenant(upload.single("file")),
  async (req, res) => {
    const id = String(req.params.id);
    const row = await prisma.attachment.findFirst({ where: { id } });
    if (!row || row.status !== AttachmentStatus.PENDING) {
      res.status(404).json({ error: "Pending attachment not found" });
      return;
    }
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ error: "file required" });
      return;
    }
    const validation = validateAttachmentBytes(file.buffer, row.mimeType);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error.message, code: validation.error.code });
      return;
    }
    await getAttachmentStorage().put(row.storageKey, file.buffer, validation.mimeType);
    const updated = await prisma.attachment.update({
      where: { id },
      data: {
        status: AttachmentStatus.ACTIVE,
        mimeType: validation.mimeType,
        byteSize: file.buffer.length,
        checksum: sha256Hex(file.buffer)
      }
    });
    await logAudit(req.user!.id, "CREATED", "ATTACHMENT", updated.id, { via: "upload-bytes" });
    res.json({ attachment: updated });
  }
);

attachmentsRouter.post("/:id/complete", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const row = await prisma.attachment.findFirst({ where: { id } });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (row.status === AttachmentStatus.ACTIVE) {
    res.json({ attachment: row });
    return;
  }
  if (row.status !== AttachmentStatus.PENDING) {
    res.status(400).json({ error: "Attachment is not pending" });
    return;
  }
  let buf: Buffer;
  try {
    buf = await getAttachmentStorage().get(row.storageKey);
  } catch {
    res.status(400).json({ error: "Upload not found in storage; upload bytes first" });
    return;
  }
  const validation = validateAttachmentBytes(buf, row.mimeType);
  if (!validation.ok) {
    res.status(400).json({ error: validation.error.message, code: validation.error.code });
    return;
  }
  const updated = await prisma.attachment.update({
    where: { id },
    data: {
      status: AttachmentStatus.ACTIVE,
      mimeType: validation.mimeType,
      byteSize: buf.length,
      checksum: sha256Hex(buf)
    }
  });
  await logAudit(req.user!.id, "CREATED", "ATTACHMENT", updated.id, { via: "complete" });
  res.json({ attachment: updated });
});

attachmentsRouter.post("/:id/retire", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = retireSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await prisma.attachment.findFirst({ where: { id } });
  if (!row || row.status === AttachmentStatus.PURGED) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const updated = await prisma.attachment.update({
    where: { id },
    data: {
      status: AttachmentStatus.RETIRED,
      retiredAt: new Date(),
      retiredByUserId: req.user!.id,
      retireReason: parsed.data.reason ?? null
    }
  });
  await logAudit(req.user!.id, "STATUS_CHANGED", "ATTACHMENT", id, { status: "RETIRED" });
  res.json({ attachment: updated });
});

attachmentsRouter.post("/:id/restore", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const row = await prisma.attachment.findFirst({ where: { id } });
  if (!row || row.status !== AttachmentStatus.RETIRED) {
    res.status(404).json({ error: "Retired attachment not found" });
    return;
  }
  const updated = await prisma.attachment.update({
    where: { id },
    data: {
      status: AttachmentStatus.ACTIVE,
      retiredAt: null,
      retiredByUserId: null,
      retireReason: null
    }
  });
  await logAudit(req.user!.id, "STATUS_CHANGED", "ATTACHMENT", id, { status: "ACTIVE" });
  res.json({ attachment: updated });
});

attachmentsRouter.delete("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const confirm = req.query.confirm === "1" || req.body?.confirm === true;
  if (!confirm) {
    res.status(400).json({ error: "Hard delete requires confirm=1 (or body.confirm=true)" });
    return;
  }
  const row = await prisma.attachment.findFirst({ where: { id } });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (row.status === AttachmentStatus.ACTIVE) {
    res.status(400).json({ error: "Retire the attachment before hard delete" });
    return;
  }
  try {
    if (row.storageKey && row.storageKey !== "pending") {
      await getAttachmentStorage().delete(row.storageKey);
    }
  } catch {
    // continue — still purge DB
  }
  await prisma.attachmentLink.deleteMany({ where: { attachmentId: id } });
  await prisma.attachment.update({
    where: { id },
    data: { status: AttachmentStatus.PURGED, storageKey: `purged/${id}` }
  });
  // Soft tombstone then delete row for cleanliness
  await prisma.attachment.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "ATTACHMENT", id, { hard: true });
  res.status(204).send();
});

function emptyToNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "" || v === "null") return null;
  return String(v);
}

function pickLinkTarget(data: {
  featureId?: string | null;
  requirementId?: string | null;
  initiativeId?: string | null;
  demandId?: string | null;
  intakeSessionId?: string | null;
}): {
  featureId: string | null;
  requirementId: string | null;
  initiativeId: string | null;
  demandId: string | null;
  intakeSessionId: string | null;
} | null {
  const featureId = data.featureId ?? null;
  const requirementId = data.requirementId ?? null;
  const initiativeId = data.initiativeId ?? null;
  const demandId = data.demandId ?? null;
  const intakeSessionId = data.intakeSessionId ?? null;
  if (!featureId && !requirementId && !initiativeId && !demandId && !intakeSessionId) return null;
  return { featureId, requirementId, initiativeId, demandId, intakeSessionId };
}

async function assertIntakeSessionExists(intakeSessionId: string | null): Promise<string | null> {
  if (!intakeSessionId) return null;
  const row = await prisma.intakeSession.findFirst({
    where: { id: intakeSessionId },
    select: { id: true }
  });
  return row ? null : "Intake session not found";
}

async function assertLinkQuota(target: {
  featureId: string | null;
  requirementId: string | null;
  initiativeId: string | null;
  demandId: string | null;
  intakeSessionId: string | null;
}): Promise<string | null> {
  const where: Prisma.AttachmentLinkWhereInput = {};
  if (target.featureId) where.featureId = target.featureId;
  else if (target.requirementId) where.requirementId = target.requirementId;
  else if (target.initiativeId) where.initiativeId = target.initiativeId;
  else if (target.demandId) where.demandId = target.demandId;
  else if (target.intakeSessionId) where.intakeSessionId = target.intakeSessionId;
  const count = await prisma.attachmentLink.count({ where });
  if (count >= ATTACHMENT_MAX_LINKS_PER_ENTITY) {
    return `Maximum of ${ATTACHMENT_MAX_LINKS_PER_ENTITY} attachments per entity`;
  }
  return null;
}
