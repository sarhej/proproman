import { IntakeMode, IntakeSessionStatus, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceContentWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";
import { creationPlanSchema, normalizeCreationPlan } from "../intake/creationPlanSchema.js";
import { planIntake } from "../intake/planner.js";
import {
  bugDraftSchema,
  normalizeBugDraft,
  normalizeIntakeDrafts,
  type BugDraft,
  type IntakeDrafts
} from "../intake/bugDraftSchema.js";
import { parseBugDrafts } from "../intake/bugParser.js";
import {
  featureDraftSchema,
  normalizeFeatureDraft,
  normalizeFeatureIntakeDrafts,
  type FeatureDraft,
  type FeatureIntakeDrafts
} from "../intake/featureDraftSchema.js";
import { parseFeatureDrafts } from "../intake/featureParser.js";

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

const clarifySchema = z.object({
  answers: z.record(z.string(), z.string().max(2000)).refine((o) => Object.keys(o).length > 0, {
    message: "At least one answer required"
  })
});

const planPatchSchema = z.object({
  creationPlan: creationPlanSchema
});

const draftPatchSchema = z.object({
  draft: z.record(z.string(), z.unknown())
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

function isLocked(status: IntakeSessionStatus): boolean {
  return status === IntakeSessionStatus.COMMITTED || status === IntakeSessionStatus.COMMITTING;
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
  if (isLocked(existing.status)) {
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

intakeSessionsRouter.post("/:id/analyze", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const tenantId = getTenantId(req);
  const existing = await prisma.intakeSession.findFirst({
    where: { id, tenantId },
    include: { product: { select: { name: true } } }
  });
  if (!existing) {
    res.status(404).json({ error: "Intake session not found" });
    return;
  }
  if (isLocked(existing.status)) {
    res.status(409).json({ error: "Intake session already committed" });
    return;
  }

  try {
    await prisma.intakeSession.update({
      where: { id: existing.id },
      data: { status: IntakeSessionStatus.ANALYZING, analyzeError: null }
    });

    const clarification =
      existing.clarification && typeof existing.clarification === "object" && !Array.isArray(existing.clarification)
        ? (existing.clarification as Record<string, string>)
        : null;

    const { plan, source } = await planIntake({
      mode: existing.mode,
      rawText: existing.rawText,
      productName: existing.product.name,
      clarificationAnswers: clarification
    });

    const nextStatus = plan.needsClarification
      ? IntakeSessionStatus.CLARIFYING
      : IntakeSessionStatus.PLAN_READY;

    const session = await prisma.intakeSession.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        creationPlan: plan as Prisma.InputJsonValue,
        confidence: plan.confidence,
        analyzeError: null,
        rawExcerptHash: hashRawText(existing.rawText),
        sourceMeta: {
          ...(typeof existing.sourceMeta === "object" && existing.sourceMeta && !Array.isArray(existing.sourceMeta)
            ? (existing.sourceMeta as Record<string, unknown>)
            : {}),
          channel: existing.sourceChannel ?? "ui_product",
          lastAnalyzedAt: new Date().toISOString(),
          plannerSource: source,
          hadRawText: existing.rawText.trim().length > 0
        }
      }
    });

    res.json({
      session: serializeSession(session),
      analyze: {
        stub: false,
        source,
        needsClarification: Boolean(plan.needsClarification),
        creationPlan: plan,
        confidence: plan.confidence,
        message: plan.needsClarification
          ? "Need a bit more context before locking the creation plan."
          : `Creation plan ready (${source}). Review items, then continue.`
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Analyze failed";
    const session = await prisma.intakeSession.update({
      where: { id: existing.id },
      data: {
        status: IntakeSessionStatus.FAILED,
        analyzeError: message.slice(0, 500)
      }
    });
    res.status(500).json({
      error: message,
      session: serializeSession(session),
      analyze: {
        stub: false,
        source: "heuristic",
        needsClarification: false,
        creationPlan: null,
        confidence: null,
        message
      }
    });
  }
});

intakeSessionsRouter.post("/:id/clarify", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = clarifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = getTenantId(req);
  const existing = await prisma.intakeSession.findFirst({
    where: { id, tenantId },
    include: { product: { select: { name: true } } }
  });
  if (!existing) {
    res.status(404).json({ error: "Intake session not found" });
    return;
  }
  if (isLocked(existing.status)) {
    res.status(409).json({ error: "Intake session already committed" });
    return;
  }

  const prior =
    existing.clarification && typeof existing.clarification === "object" && !Array.isArray(existing.clarification)
      ? (existing.clarification as Record<string, string>)
      : {};
  const answers = { ...prior, ...parsed.data.answers };

  const { plan, source } = await planIntake({
    mode: existing.mode,
    rawText: existing.rawText,
    productName: existing.product.name,
    clarificationAnswers: answers
  });

  const session = await prisma.intakeSession.update({
    where: { id: existing.id },
    data: {
      clarification: answers,
      creationPlan: plan as Prisma.InputJsonValue,
      confidence: plan.confidence,
      status: plan.needsClarification ? IntakeSessionStatus.CLARIFYING : IntakeSessionStatus.PLAN_READY,
      analyzeError: null,
      sourceMeta: {
        ...(typeof existing.sourceMeta === "object" && existing.sourceMeta && !Array.isArray(existing.sourceMeta)
          ? (existing.sourceMeta as Record<string, unknown>)
          : {}),
        lastClarifiedAt: new Date().toISOString(),
        plannerSource: source
      }
    }
  });

  res.json({
    session: serializeSession(session),
    analyze: {
      stub: false,
      source,
      needsClarification: Boolean(plan.needsClarification),
      creationPlan: plan,
      confidence: plan.confidence,
      message: plan.needsClarification
        ? "Still unclear — answer remaining questions or edit the plan manually."
        : "Clarification applied. Review the creation plan."
    }
  });
});

intakeSessionsRouter.patch("/:id/plan", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = planPatchSchema.safeParse(req.body);
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
  if (isLocked(existing.status)) {
    res.status(409).json({ error: "Intake session already committed" });
    return;
  }

  const plan = normalizeCreationPlan({
    ...parsed.data.creationPlan,
    needsClarification: false
  });

  const session = await prisma.intakeSession.update({
    where: { id: existing.id },
    data: {
      creationPlan: plan as Prisma.InputJsonValue,
      confidence: plan.confidence,
      status: IntakeSessionStatus.PLAN_READY,
      analyzeError: null
    }
  });

  await logAudit(req.user!.id, "UPDATED", "INTAKE_SESSION", session.id, { fields: ["creationPlan"] });

  res.json({ session: serializeSession(session) });
});

intakeSessionsRouter.post("/:id/drafts", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const tenantId = getTenantId(req);
  const existing = await prisma.intakeSession.findFirst({
    where: { id, tenantId }
  });
  if (!existing) {
    res.status(404).json({ error: "Intake session not found" });
    return;
  }
  if (isLocked(existing.status)) {
    res.status(409).json({ error: "Intake session already committed" });
    return;
  }
  if (existing.mode !== IntakeMode.BUG && existing.mode !== IntakeMode.FEATURE) {
    res.status(501).json({
      error: "Unsupported intake mode for drafts"
    });
    return;
  }
  if (
    existing.status !== IntakeSessionStatus.PLAN_READY &&
    existing.status !== IntakeSessionStatus.REVIEWING &&
    existing.status !== IntakeSessionStatus.DRAFTING
  ) {
    res.status(409).json({ error: "Creation plan must be ready before generating drafts" });
    return;
  }

  const planParsed = creationPlanSchema.safeParse(existing.creationPlan);
  if (!planParsed.success) {
    res.status(409).json({ error: "Session has no valid creationPlan" });
    return;
  }

  try {
    await prisma.intakeSession.update({
      where: { id: existing.id },
      data: { status: IntakeSessionStatus.DRAFTING, analyzeError: null }
    });

    const clarification =
      existing.clarification && typeof existing.clarification === "object" && !Array.isArray(existing.clarification)
        ? (existing.clarification as Record<string, string>)
        : null;

    const parsed =
      existing.mode === IntakeMode.BUG
        ? await parseBugDrafts({
            rawText: existing.rawText,
            creationPlan: planParsed.data,
            clarificationAnswers: clarification
          })
        : await parseFeatureDrafts({
            rawText: existing.rawText,
            creationPlan: planParsed.data,
            clarificationAnswers: clarification
          });

    const { drafts, source } = parsed;

    const session = await prisma.intakeSession.update({
      where: { id: existing.id },
      data: {
        status: IntakeSessionStatus.REVIEWING,
        drafts: drafts as Prisma.InputJsonValue,
        analyzeError: null,
        sourceMeta: {
          ...(typeof existing.sourceMeta === "object" && existing.sourceMeta && !Array.isArray(existing.sourceMeta)
            ? (existing.sourceMeta as Record<string, unknown>)
            : {}),
          lastDraftsAt: new Date().toISOString(),
          draftSource: source
        }
      }
    });

    await logAudit(req.user!.id, "UPDATED", "INTAKE_SESSION", session.id, { fields: ["drafts"], source });

    const label = existing.mode === IntakeMode.BUG ? "Bug" : "Feature";
    res.json({
      session: serializeSession(session),
      drafts,
      source,
      message: `${label} drafts ready (${source}). Review fields, then continue in a later phase to create hub rows.`
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Draft generation failed";
    const session = await prisma.intakeSession.update({
      where: { id: existing.id },
      data: {
        status: IntakeSessionStatus.FAILED,
        analyzeError: message.slice(0, 500)
      }
    });
    res.status(500).json({ error: message, session: serializeSession(session) });
  }
});

intakeSessionsRouter.patch("/:id/drafts/:draftKey", requireWorkspaceContentWrite(), async (req, res) => {
  const id = String(req.params.id);
  const draftKey = String(req.params.draftKey);
  const parsed = draftPatchSchema.safeParse(req.body);
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
  if (isLocked(existing.status)) {
    res.status(409).json({ error: "Intake session already committed" });
    return;
  }
  if (existing.mode !== IntakeMode.BUG && existing.mode !== IntakeMode.FEATURE) {
    res.status(501).json({ error: "Unsupported intake mode for draft edits" });
    return;
  }

  const draftsParsed = z
    .object({ items: z.array(z.unknown()) })
    .safeParse(existing.drafts);
  if (!draftsParsed.success) {
    res.status(409).json({ error: "No drafts to edit — generate drafts first" });
    return;
  }

  const items = draftsParsed.data.items as Array<BugDraft | FeatureDraft>;
  const idx = items.findIndex((d) => d && typeof d === "object" && d.key === draftKey);
  if (idx < 0) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  const patch = parsed.data.draft;
  const skipKeys = new Set(["key", "hubEntityType", "storyType", "fieldProvenance"]);
  const sourceMeta =
    existing.drafts && typeof existing.drafts === "object" && !Array.isArray(existing.drafts)
      ? (existing.drafts as { source?: "heuristic" | "llm"; generatedAt?: string })
      : {};

  if (existing.mode === IntakeMode.BUG) {
    const current = bugDraftSchema.parse(items[idx]);
    const provenance = { ...current.fieldProvenance };
    for (const field of Object.keys(patch)) {
      if (skipKeys.has(field)) continue;
      if (patch[field] !== undefined) {
        (provenance as Record<string, string>)[field] = "user";
      }
    }
    const merged = normalizeBugDraft(
      bugDraftSchema.parse({
        ...current,
        ...patch,
        key: current.key,
        hubEntityType: "Feature",
        storyType: "BUG",
        fieldProvenance: provenance
      })
    );
    const nextItems = [...(items as BugDraft[])];
    nextItems[idx] = merged;
    const drafts: IntakeDrafts = normalizeIntakeDrafts({
      items: nextItems.map((d) => bugDraftSchema.parse(d)),
      source: sourceMeta.source ?? "heuristic",
      generatedAt: sourceMeta.generatedAt
    });
    const session = await prisma.intakeSession.update({
      where: { id: existing.id },
      data: {
        drafts: drafts as Prisma.InputJsonValue,
        status: IntakeSessionStatus.REVIEWING
      }
    });
    await logAudit(req.user!.id, "UPDATED", "INTAKE_SESSION", session.id, {
      fields: ["drafts"],
      draftKey
    });
    res.json({ session: serializeSession(session), draft: merged, drafts });
    return;
  }

  const current = featureDraftSchema.parse(items[idx]);
  const provenance = { ...current.fieldProvenance };
  for (const field of Object.keys(patch)) {
    if (skipKeys.has(field)) continue;
    if (patch[field] !== undefined) {
      (provenance as Record<string, string>)[field] = "user";
    }
  }
  const merged = normalizeFeatureDraft(
    featureDraftSchema.parse({
      ...current,
      ...patch,
      key: current.key,
      hubEntityType: "Feature",
      fieldProvenance: provenance
    })
  );
  const nextItems = [...(items as FeatureDraft[])];
  nextItems[idx] = merged;
  const drafts: FeatureIntakeDrafts = normalizeFeatureIntakeDrafts({
    items: nextItems.map((d) => featureDraftSchema.parse(d)),
    source: sourceMeta.source ?? "heuristic",
    generatedAt: sourceMeta.generatedAt
  });

  const session = await prisma.intakeSession.update({
    where: { id: existing.id },
    data: {
      drafts: drafts as Prisma.InputJsonValue,
      status: IntakeSessionStatus.REVIEWING
    }
  });

  await logAudit(req.user!.id, "UPDATED", "INTAKE_SESSION", session.id, {
    fields: ["drafts"],
    draftKey
  });

  res.json({ session: serializeSession(session), draft: merged, drafts });
});