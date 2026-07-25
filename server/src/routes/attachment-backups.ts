import { AttachmentBackupJobStatus, AttachmentStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";
import { getAttachmentStorage } from "../attachments/storageFactory.js";
import { buildBackupManifestKey } from "../attachments/constants.js";

const createSchema = z.object({
  status: z.nativeEnum(AttachmentStatus).optional(),
  includeRetired: z.boolean().optional()
});

export const attachmentBackupsRouter = Router();
attachmentBackupsRouter.use(requireAuth);

attachmentBackupsRouter.get("/", requireWorkspaceStructureWrite(), async (_req, res) => {
  const jobs = await prisma.attachmentBackupJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50
  });
  res.json({ jobs });
});

attachmentBackupsRouter.get("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const job = await prisma.attachmentBackupJob.findFirst({ where: { id } });
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  let manifestDownloadUrl: string | null = null;
  let contentPath: string | null = null;
  if (job.status === AttachmentBackupJobStatus.SUCCEEDED && job.manifestStorageKey) {
    const signed = await getAttachmentStorage().getSignedDownloadUrl(job.manifestStorageKey, 300);
    manifestDownloadUrl = signed;
    contentPath = signed ? null : `/api/attachment-backups/${job.id}/manifest`;
  }
  res.json({ job, manifestDownloadUrl, contentPath });
});

attachmentBackupsRouter.get("/:id/manifest", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const job = await prisma.attachmentBackupJob.findFirst({ where: { id } });
  if (!job?.manifestStorageKey || job.status !== AttachmentBackupJobStatus.SUCCEEDED) {
    res.status(404).json({ error: "Manifest not available" });
    return;
  }
  try {
    const buf = await getAttachmentStorage().get(job.manifestStorageKey);
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="attachment-backup-${job.id}-manifest.json"`
    );
    res.send(buf);
  } catch {
    res.status(404).json({ error: "Manifest blob missing" });
  }
});

attachmentBackupsRouter.post("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = getTenantId(req);
  const job = await prisma.attachmentBackupJob.create({
    data: {
      tenantId,
      createdByUserId: req.user!.id,
      status: AttachmentBackupJobStatus.PENDING,
      filterJson: parsed.data as Prisma.InputJsonValue,
      startedAt: new Date()
    }
  });

  // Run synchronously for v0 (manifest-only). Archive zip stubbed.
  try {
    await prisma.attachmentBackupJob.update({
      where: { id: job.id },
      data: { status: AttachmentBackupJobStatus.RUNNING }
    });

    const statusFilter = parsed.data.includeRetired
      ? { in: [AttachmentStatus.ACTIVE, AttachmentStatus.RETIRED] }
      : parsed.data.status
        ? parsed.data.status
        : AttachmentStatus.ACTIVE;

    const attachments = await prisma.attachment.findMany({
      where: { status: statusFilter },
      include: {
        links: {
          select: {
            id: true,
            featureId: true,
            requirementId: true,
            initiativeId: true,
            demandId: true,
            intakeSessionId: true,
            role: true,
            createdByUserId: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    const manifest = {
      version: 1,
      tenantId,
      jobId: job.id,
      createdAt: new Date().toISOString(),
      createdByUserId: req.user!.id,
      filter: parsed.data,
      attachmentCount: attachments.length,
      attachments: attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        byteSize: a.byteSize,
        checksum: a.checksum,
        storageKey: a.storageKey,
        source: a.source,
        kind: a.kind,
        parentAttachmentId: a.parentAttachmentId,
        status: a.status,
        createdByUserId: a.createdByUserId,
        createdAt: a.createdAt.toISOString(),
        links: a.links
      })),
      archive: null as null | { note: string },
      note: "Manifest-only backup (v0). Full blob archive can be added later."
    };
    manifest.archive = {
      note: "Archive zip not generated in v0 — use storageKey + checksums to verify objects."
    };

    const manifestKey = buildBackupManifestKey(tenantId, job.id);
    const body = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
    await getAttachmentStorage().put(manifestKey, body, "application/json");

    const done = await prisma.attachmentBackupJob.update({
      where: { id: job.id },
      data: {
        status: AttachmentBackupJobStatus.SUCCEEDED,
        manifestStorageKey: manifestKey,
        archiveStorageKey: null,
        byteSize: body.length,
        finishedAt: new Date()
      }
    });
    await logAudit(req.user!.id, "CREATED", "ATTACHMENT_BACKUP_JOB", done.id, {
      attachmentCount: attachments.length
    });
    res.status(201).json({
      job: done,
      contentPath: `/api/attachment-backups/${done.id}/manifest`
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backup failed";
    const failed = await prisma.attachmentBackupJob.update({
      where: { id: job.id },
      data: {
        status: AttachmentBackupJobStatus.FAILED,
        error: message,
        finishedAt: new Date()
      }
    });
    res.status(500).json({ job: failed, error: message });
  }
});
