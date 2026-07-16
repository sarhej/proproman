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
import { requireWorkspaceContentWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";
import { getAttachmentStorage } from "../attachments/storageFactory.js";
import {
  ATTACHMENT_AUDIO_MAX_BYTES,
  ATTACHMENT_MAX_LINKS_PER_ENTITY,
  buildAttachmentStorageKey,
  sanitizeFilename,
  sha256Hex,
  validateAttachmentBytes
} from "../attachments/constants.js";
import { isSpeechSttConfigured, transcribeWithWhisper } from "../speech/whisperClient.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACHMENT_AUDIO_MAX_BYTES, files: 1 }
});

const targetSchema = z.object({
  featureId: z.string().nullable().optional(),
  requirementId: z.string().nullable().optional(),
  initiativeId: z.string().nullable().optional(),
  demandId: z.string().nullable().optional(),
  intakeSessionId: z.string().nullable().optional(),
  role: z.nativeEnum(AttachmentLinkRole).optional(),
  filename: z.string().min(1).max(200).optional()
});

function emptyToNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "" || v === "null") return null;
  return String(v);
}

function pickLinkTarget(data: z.infer<typeof targetSchema>): {
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

async function assertLinkQuota(
  target: NonNullable<ReturnType<typeof pickLinkTarget>>,
  extra = 0
): Promise<string | null> {
  const where: Prisma.AttachmentLinkWhereInput = {};
  if (target.featureId) where.featureId = target.featureId;
  else if (target.requirementId) where.requirementId = target.requirementId;
  else if (target.initiativeId) where.initiativeId = target.initiativeId;
  else if (target.demandId) where.demandId = target.demandId;
  else if (target.intakeSessionId) where.intakeSessionId = target.intakeSessionId;
  const count = await prisma.attachmentLink.count({ where });
  if (count + extra > ATTACHMENT_MAX_LINKS_PER_ENTITY) {
    return `Maximum of ${ATTACHMENT_MAX_LINKS_PER_ENTITY} attachments per entity`;
  }
  return null;
}

export const voiceRouter = Router();
voiceRouter.use(requireAuth);

voiceRouter.get("/status", (_req, res) => {
  res.json({ enabled: isSpeechSttConfigured() });
});

voiceRouter.post(
  "/transcribe",
  requireWorkspaceContentWrite(),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || "Upload failed" });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    if (!isSpeechSttConfigured()) {
      res.status(503).json({ error: "Speech STT is not configured", code: "SPEECH_NOT_CONFIGURED" });
      return;
    }
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ error: "file required (multipart field name: file)" });
      return;
    }
    const validation = validateAttachmentBytes(file.buffer, file.mimetype, { expectAudio: true });
    if (!validation.ok) {
      res.status(400).json({ error: validation.error.message, code: validation.error.code });
      return;
    }
    try {
      const result = await transcribeWithWhisper(
        file.buffer,
        validation.mimeType,
        sanitizeFilename(file.originalname || "audio.webm")
      );
      res.json({
        transcript: result.text,
        language: result.language ?? null
      });
    } catch (e) {
      const err = e as Error & { code?: string; status?: number };
      const status = err.code === "SPEECH_NOT_CONFIGURED" ? 503 : 502;
      res.status(status).json({ error: err.message, code: err.code ?? "SPEECH_PROVIDER_ERROR" });
    }
  }
);

voiceRouter.post(
  "/capture",
  requireWorkspaceContentWrite(),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || "Upload failed" });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    if (!isSpeechSttConfigured()) {
      res.status(503).json({ error: "Speech STT is not configured", code: "SPEECH_NOT_CONFIGURED" });
      return;
    }
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ error: "file required (multipart field name: file)" });
      return;
    }
    const parsed = targetSchema.safeParse({
      featureId: emptyToNull(req.body.featureId),
      requirementId: emptyToNull(req.body.requirementId),
      initiativeId: emptyToNull(req.body.initiativeId),
      demandId: emptyToNull(req.body.demandId),
      intakeSessionId: emptyToNull(req.body.intakeSessionId),
      role: req.body.role,
      filename: req.body.filename
    });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const audioValidation = validateAttachmentBytes(file.buffer, file.mimetype, { expectAudio: true });
    if (!audioValidation.ok) {
      res.status(400).json({ error: audioValidation.error.message, code: audioValidation.error.code });
      return;
    }

    const linkTarget = pickLinkTarget(parsed.data);
    if (linkTarget) {
      const linkErr = await assertLinkQuota(linkTarget, 2);
      if (linkErr) {
        res.status(400).json({ error: linkErr });
        return;
      }
    }

    let transcriptText: string;
    let language: string | null = null;
    const overrideTranscript =
      typeof req.body.transcript === "string" ? req.body.transcript.trim() : "";
    if (overrideTranscript) {
      transcriptText = overrideTranscript;
    } else {
      try {
        const result = await transcribeWithWhisper(
          file.buffer,
          audioValidation.mimeType,
          sanitizeFilename(parsed.data.filename || file.originalname || "audio.webm")
        );
        transcriptText = result.text;
        language = result.language ?? null;
      } catch (e) {
        const err = e as Error & { code?: string };
        res.status(502).json({ error: err.message, code: err.code ?? "SPEECH_PROVIDER_ERROR" });
        return;
      }
    }

    const tenantId = getTenantId(req);
    const audioFilename = sanitizeFilename(
      parsed.data.filename || file.originalname || `voice-${Date.now()}.webm`
    );
    const transcriptFilename = audioFilename.replace(/\.[^.]+$/, "") + "-transcript.txt";
    const transcriptBuf = Buffer.from(transcriptText, "utf8");

    const audioRow = await prisma.attachment.create({
      data: {
        createdByUserId: req.user!.id,
        filename: audioFilename,
        mimeType: audioValidation.mimeType,
        byteSize: file.buffer.length,
        checksum: sha256Hex(file.buffer),
        storageKey: "pending",
        source: AttachmentSource.UPLOAD,
        kind: AttachmentKind.ORIGINAL,
        status: AttachmentStatus.PENDING
      }
    });

    const audioKey = buildAttachmentStorageKey(tenantId, audioRow.id, audioFilename);
    try {
      await getAttachmentStorage().put(audioKey, file.buffer, audioValidation.mimeType);
    } catch {
      await prisma.attachment.delete({ where: { id: audioRow.id } }).catch(() => undefined);
      res.status(500).json({ error: "Failed to store audio" });
      return;
    }

    const audioActive = await prisma.attachment.update({
      where: { id: audioRow.id },
      data: { storageKey: audioKey, status: AttachmentStatus.ACTIVE }
    });

    const transcriptRow = await prisma.attachment.create({
      data: {
        createdByUserId: req.user!.id,
        filename: transcriptFilename,
        mimeType: "text/plain",
        byteSize: transcriptBuf.length,
        checksum: sha256Hex(transcriptBuf),
        storageKey: "pending",
        source: AttachmentSource.AGENT,
        kind: AttachmentKind.DERIVATIVE,
        parentAttachmentId: audioActive.id,
        status: AttachmentStatus.PENDING
      }
    });

    const transcriptKey = buildAttachmentStorageKey(tenantId, transcriptRow.id, transcriptFilename);
    try {
      await getAttachmentStorage().put(transcriptKey, transcriptBuf, "text/plain");
    } catch {
      await prisma.attachment.delete({ where: { id: transcriptRow.id } }).catch(() => undefined);
      res.status(500).json({ error: "Failed to store transcript" });
      return;
    }

    const transcriptActive = await prisma.attachment.update({
      where: { id: transcriptRow.id },
      data: { storageKey: transcriptKey, status: AttachmentStatus.ACTIVE }
    });

    const role = parsed.data.role ?? AttachmentLinkRole.EVIDENCE;
    let audioLink = null;
    let transcriptLink = null;
    if (linkTarget) {
      audioLink = await prisma.attachmentLink.create({
        data: {
          attachmentId: audioActive.id,
          createdByUserId: req.user!.id,
          role,
          ...linkTarget
        }
      });
      transcriptLink = await prisma.attachmentLink.create({
        data: {
          attachmentId: transcriptActive.id,
          createdByUserId: req.user!.id,
          role,
          ...linkTarget
        }
      });
    }

    await logAudit(req.user!.id, "CREATED", "ATTACHMENT", audioActive.id, {
      via: "voice-capture",
      kind: "ORIGINAL",
      language
    });
    await logAudit(req.user!.id, "CREATED", "ATTACHMENT", transcriptActive.id, {
      via: "voice-capture",
      kind: "DERIVATIVE",
      parentAttachmentId: audioActive.id
    });

    res.status(201).json({
      transcript: transcriptText,
      language,
      audio: { attachment: audioActive, link: audioLink },
      transcriptAttachment: { attachment: transcriptActive, link: transcriptLink }
    });
  }
);
