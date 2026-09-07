import { IntakeMode, IntakeSessionStatus, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceContentWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";

export const intakeSessionsRouter = Router();
intakeSessionsRouter.use(requireAuth);

const createSchema = z.object({
  productId: z.string().min(1),
  mode: z.nativeEnum(IntakeMode)
});

const patchSchema = z.object({
  rawText: z.string().max(100_000).optional(),
  sourceChannel: z.string().max(64).nullable().optional(),
  status: z.enum(["CAPTURING", "ABANDONED", "FAILED"]).optional()
});

function hashRawText(rawText: string): string {
  return createHash("sha256").update(rawText.normalize("NFKC").trim()).digest("hex");
}

function serializeSession(row: {
  id: string;
  tenantId: string | null;
  productId: string;
  mode: IntakeMode;
  status: IntakeSessionStatus;
  rawText: string;
  rawExcerptHash: string | null;
  sourceChannel: string | null;
  sourceMeta: Prisma.JsonValue | null;
  clarification: Prisma.JsonValue | null;
  creationPlan: Prisma.JsonValue | null;
  drafts: Prisma.JsonValue | null;
  analyzeError: string | null;
  confidence: number | null;
  createdById: string | null;
  committedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    productId: row.productId,
    mode: row.mode,
    status: row.status,
    rawText: row.rawText,
    rawExcerptHash: row.rawExcerptHash,
    sourceChannel: row.sourceChannel,
    sourceMeta: row.sourceMeta,
    clarification: row.clarification,
    creationPlan: row.creationPlan,
    drafts: row.drafts,
    analyzeError: row.analyzeError,
    confidence: row.confidence,
    createdById: row.createdById,
    committedAt: row.committedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

intakeSessionsRouter.post("/", requireWorkspaceContentWrite(), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = getTenantId(req);
  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, tenantId },
    select: { id: true }
  });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const session = await prisma.intakeSession.create({
    data: {
      tenantId,
      productId: product.id,
      mode: parsed.data.mode,
      status: IntakeSessionStatus.CAPTURING,
      rawText: "",
      sourceChannel: "ui_product",
      createdById: req.user!.id,
      sourceMeta: {
        channel: "ui_product",
        capturedAt: new Date().toISOString(),
        attachments: [],
        urlFetches: []
      }
    }
  });

  await logAudit(req.user!.id, "CREATED", "INTAKE_SESSION", session.id, {
    productId: product.id,
    mode: session.mode
  });

  res.status(201).json({ session: serializeSession(session) });
});

intakeSessionsRouter.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  const tenantId = getTenantId(req);
  const session = await prisma.intakeSession.findFirst({
    where: { id, tenantId }
  });
  if (!session) {
    res.status(404).json({ error: "Intake session not found" });
    return;
  }
  res.json({ session: serializeSession(session) });
});

intakeSessionsRouter.patch("/:id", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = getTenantId(req);
  const existing = await prisma.intakeSession.findFirst({
    where: { id, tenantId }
  });
  if (!existing) {
    res.status(404).json({ error: "Intake session not found" });
    return;
  }
  if (
    existing.status === IntakeSessionStatus.COMMITTED ||
    existing.status === IntakeSessionStatus.COMMITTING
  ) {
    res.status(409).json({ error: "Intake session is locked after commit" });
    return;
  }

  const data: Prisma.IntakeSessionUpdateInput = {};
  if (parsed.data.rawText !== undefined) {
    data.rawText = parsed.data.rawText;
    data.rawExcerptHash = hashRawText(parsed.data.rawText);
  }
  if (parsed.data.sourceChannel !== undefined) {
    data.sourceChannel = parsed.data.sourceChannel;
  }
  if (parsed.data.status !== undefined) {
    data.status = parsed.data.status as IntakeSessionStatus;
  }

  const session = await prisma.intakeSession.update({
    where: { id: existing.id },
    data
  });

  await logAudit(req.user!.id, "UPDATED", "INTAKE_SESSION", session.id, {
    fields: Object.keys(parsed.data)
  });

  res.json({ session: serializeSession(session) });
});

/**
 * Phase 1 stub: no LLM, no hub writes.
 * Clears analyzeError, stays CAPTURING with null plan so UI can continue to manual form.
 */
intakeSessionsRouter.post("/:id/analyze", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const tenantId = getTenantId(req);
  const existing = await prisma.intakeSession.findFirst({
    where: { id, tenantId }
  });
  if (!existing) {
    res.status(404).json({ error: "Intake session not found" });
    return;
  }
  if (existing.status === IntakeSessionStatus.COMMITTED) {
    res.status(409).json({ error: "Intake session already committed" });
    return;
  }

  const rawText = existing.rawText.trim();
  const session = await prisma.intakeSession.update({
    where: { id: existing.id },
    data: {
      status: IntakeSessionStatus.CAPTURING,
      analyzeError: null,
      creationPlan: Prisma.DbNull,
      confidence: null,
      rawExcerptHash: hashRawText(existing.rawText),
      sourceMeta: {
        ...(typeof existing.sourceMeta === "object" && existing.sourceMeta && !Array.isArray(existing.sourceMeta)
          ? (existing.sourceMeta as Record<string, unknown>)
          : {}),
        channel: existing.sourceChannel ?? "ui_product",
        lastAnalyzedAt: new Date().toISOString(),
        analyzeStub: true,
        hadRawText: rawText.length > 0
      }
    }
  });

  res.json({
    session: serializeSession(session),
    analyze: {
      stub: true,
      needsClarification: false,
      creationPlan: null,
      confidence: null,
      message: rawText.length
        ? "Analyze stub: planner not enabled yet. Continue with manual form or wait for Phase 2."
        : "Add text or attachments, then Analyze again."
    }
  });
});
