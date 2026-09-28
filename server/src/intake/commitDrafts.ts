import {
  CommercialType,
  FeatureStatus,
  Horizon,
  InitiativeStatus,
  Prisma,
  Priority,
  StoryType,
  type IntakeMode
} from "@prisma/client";
import { prisma } from "../db.js";
import { notifyHubChange } from "../services/hubChangeHub.js";
import { bugDraftSchema, type BugDraft, type IntakeDrafts } from "./bugDraftSchema.js";
import {
  featureDraftSchema,
  resolveFeatureCommitStoryAndPriority,
  type FeatureDraft,
  type FeatureIntakeDrafts
} from "./featureDraftSchema.js";

export type CommitCreatedRef = {
  draftKey: string | null;
  id: string;
  title: string;
};

export type CommitResult = {
  initiatives: CommitCreatedRef[];
  features: Array<CommitCreatedRef & { storyType: string | null }>;
  requirements: Array<{
    draftKey: string;
    id: string;
    title: string;
    featureId: string;
  }>;
};

export type CommitGate =
  | { ok: true; approved: Array<BugDraft | FeatureDraft>; skippedKeys: string[] }
  | { ok: false; error: string; code: "PENDING" | "NONE_APPROVED" | "NO_DRAFTS" };

export function evaluateCommitGate(items: Array<BugDraft | FeatureDraft>): CommitGate {
  if (items.length === 0) {
    return { ok: false, error: "No drafts to commit", code: "NO_DRAFTS" };
  }
  const pending = items.filter((d) => d.approval === "pending");
  if (pending.length > 0) {
    return {
      ok: false,
      error: `All drafts must be approved or skipped before create (${pending.length} still need review)`,
      code: "PENDING"
    };
  }
  const approved = items.filter((d) => d.approval === "approved");
  if (approved.length === 0) {
    return {
      ok: false,
      error: "Approve at least one draft before creating in the hub",
      code: "NONE_APPROVED"
    };
  }
  return {
    ok: true,
    approved,
    skippedKeys: items.filter((d) => d.approval === "skipped").map((d) => d.key)
  };
}

export function isBugDraft(draft: BugDraft | FeatureDraft): draft is BugDraft {
  return draft.storyType === "BUG";
}

export function buildBugFeatureDescription(draft: BugDraft): string {
  const parts: string[] = [];
  if (draft.description.trim()) parts.push(draft.description.trim());
  if (draft.stepsToReproduce.length) {
    parts.push(
      "## Steps to reproduce\n" + draft.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`).join("\n")
    );
  }
  if (draft.expected.trim()) parts.push(`## Expected\n${draft.expected.trim()}`);
  if (draft.actual.trim()) parts.push(`## Actual\n${draft.actual.trim()}`);
  if (draft.environment.trim()) parts.push(`## Environment\n${draft.environment.trim()}`);
  if (draft.affectedArea.trim()) parts.push(`## Affected area\n${draft.affectedArea.trim()}`);
  return parts.join("\n\n").slice(0, 50_000);
}

export function buildFeatureDescription(draft: FeatureDraft): string {
  const parts: string[] = [];
  if (draft.problem.trim()) parts.push(`## Problem\n${draft.problem.trim()}`);
  if (draft.solution.trim()) parts.push(`## Solution\n${draft.solution.trim()}`);
  if (draft.personas.length) {
    parts.push(`## Personas\n${draft.personas.map((p) => `- ${p}`).join("\n")}`);
  }
  if (draft.businessValue.trim()) parts.push(`## Business value\n${draft.businessValue.trim()}`);
  if (draft.priorityRationale.trim()) {
    parts.push(`## Priority rationale\n${draft.priorityRationale.trim()}`);
  }
  if (draft.missingInputs.length) {
    parts.push(`## Missing inputs\n${draft.missingInputs.map((m) => `- ${m}`).join("\n")}`);
  }
  if (draft.dependencies.length) {
    parts.push(`## Dependencies\n${draft.dependencies.map((d) => `- ${d}`).join("\n")}`);
  }
  if (draft.risks.length) parts.push(`## Risks\n${draft.risks.map((r) => `- ${r}`).join("\n")}`);
  if (draft.openQuestions.length) {
    parts.push(`## Open questions\n${draft.openQuestions.map((q) => `- ${q}`).join("\n")}`);
  }
  return parts.join("\n\n").slice(0, 50_000);
}

export function requirementTitlesFromDraft(draft: BugDraft | FeatureDraft): Array<{
  key: string;
  title: string;
  description: string;
}> {
  const out: Array<{ key: string; title: string; description: string }> = [];
  const seen = new Set<string>();
  for (const line of draft.acceptanceCriteria) {
    const title = line.trim();
    if (!title) continue;
    const k = title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      key: `${draft.key}-ac-${out.length + 1}`,
      title: title.slice(0, 500),
      description: ""
    });
  }
  for (const req of draft.requirements) {
    const title = req.title.trim();
    if (!title) continue;
    const k = title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      key: req.key,
      title: title.slice(0, 500),
      description: (req.description ?? "").slice(0, 20_000)
    });
  }
  return out;
}

export function parseSessionDraftItems(
  mode: IntakeMode,
  draftsJson: unknown
): Array<BugDraft | FeatureDraft> {
  if (!draftsJson || typeof draftsJson !== "object") return [];
  const items = (draftsJson as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  if (mode === "BUG") {
    return items.map((raw) => bugDraftSchema.parse(raw));
  }
  if (mode === "FEATURE") {
    return items.map((raw) => featureDraftSchema.parse(raw));
  }
  return [];
}

export type CommitIntakeInput = {
  sessionId: string;
  tenantId: string;
  productId: string;
  mode: IntakeMode;
  drafts: IntakeDrafts | FeatureIntakeDrafts;
  userId: string;
  initiativeId?: string | null;
  createInitiative?: { title: string } | null;
};

export type CommitIntakeOutcome =
  | { ok: true; result: CommitResult; createdNewInitiative: boolean }
  | { ok: false; status: 400 | 409; error: string };

async function resolveDomainIdForProduct(
  tenantId: string,
  productId: string
): Promise<string | null> {
  const sibling = await prisma.initiative.findFirst({
    where: { tenantId, productId, archivedAt: null },
    select: { domainId: true },
    orderBy: { sortOrder: "asc" }
  });
  if (sibling?.domainId) return sibling.domainId;
  const domain = await prisma.domain.findFirst({
    where: { tenantId },
    select: { id: true },
    orderBy: { sortOrder: "asc" }
  });
  return domain?.id ?? null;
}

function hubPriorityEnum(p: "P0" | "P1" | "P2" | "P3"): Priority {
  return Priority[p];
}

/**
 * Persist approved drafts as hub Features (+ Requirements).
 * Caller should set session COMMITTING before and COMMITTED after on success.
 */
export async function commitIntakeDrafts(input: CommitIntakeInput): Promise<CommitIntakeOutcome> {
  const items = parseSessionDraftItems(input.mode, input.drafts);
  const gate = evaluateCommitGate(items);
  if (!gate.ok) {
    return { ok: false, status: 409, error: gate.error };
  }

  const wantNew = Boolean(input.createInitiative?.title.trim());
  let domainIdForCreate: string | null = null;
  if (wantNew) {
    domainIdForCreate = await resolveDomainIdForProduct(input.tenantId, input.productId);
    if (!domainIdForCreate) {
      return {
        ok: false,
        status: 409,
        error: "Cannot create Initiative: workspace has no Domain to attach it to"
      };
    }
  }

  const providedDefault = input.initiativeId ?? null;
  if (!wantNew) {
    for (const draft of gate.approved) {
      const resolved = draft.route?.initiativeId || providedDefault;
      if (!resolved) {
        return {
          ok: false,
          status: 409,
          error: `Choose an Initiative for draft "${draft.title}" (or create a new one)`
        };
      }
      const exists = await prisma.initiative.findFirst({
        where: { id: resolved, tenantId: input.tenantId },
        select: { id: true }
      });
      if (!exists) {
        return {
          ok: false,
          status: 409,
          error: `Initiative not found for draft "${draft.title}"`
        };
      }
    }
  }

  const result: CommitResult = { initiatives: [], features: [], requirements: [] };
  const featureInitiativePairs: Array<{ featureId: string; initiativeId: string }> = [];
  let createdNewInitiative = false;

  await prisma.$transaction(async (tx) => {
    let defaultInitiativeId = providedDefault;

    if (wantNew && domainIdForCreate && input.createInitiative) {
      const init = await tx.initiative.create({
        data: {
          tenantId: input.tenantId,
          productId: input.productId,
          domainId: domainIdForCreate,
          title: input.createInitiative.title.trim().slice(0, 500),
          description: `Created from AI product intake session ${input.sessionId}`,
          ownerId: input.userId,
          priority: Priority.P2,
          horizon: Horizon.NEXT,
          status: InitiativeStatus.IDEA,
          commercialType: CommercialType.CONTRACT_ENABLER,
          isEpic: true,
          isGap: false,
          sortOrder: 0
        }
      });
      defaultInitiativeId = init.id;
      createdNewInitiative = true;
      result.initiatives.push({ draftKey: null, id: init.id, title: init.title });
    }

    for (const draft of gate.approved) {
      const initiativeId = (draft.route?.initiativeId || defaultInitiativeId)!;
      if (!initiativeId) {
        throw new Error(`Missing Initiative for draft "${draft.title}"`);
      }

      let storyType: StoryType;
      let hubPriority: "P0" | "P1" | "P2" | "P3";
      let description: string;
      let acceptanceCriteriaText: string | null;
      let labels: Prisma.InputJsonValue;

      if (isBugDraft(draft)) {
        storyType = StoryType.BUG;
        hubPriority = draft.priority;
        description = buildBugFeatureDescription(draft);
        acceptanceCriteriaText =
          draft.acceptanceCriteria.length > 0 ? draft.acceptanceCriteria.join("\n") : null;
        labels = {
          severity: draft.severity,
          priority: draft.priority,
          intakeSessionId: input.sessionId,
          intakeDraftKey: draft.key
        };
      } else {
        const mapped = resolveFeatureCommitStoryAndPriority(draft);
        storyType = StoryType[mapped.storyType];
        hubPriority = mapped.hubPriority;
        description = buildFeatureDescription(draft);
        acceptanceCriteriaText =
          draft.acceptanceCriteria.length > 0 ? draft.acceptanceCriteria.join("\n") : null;
        labels = {
          priority: draft.priority,
          intakeSessionId: input.sessionId,
          intakeDraftKey: draft.key
        };
      }

      const feature = await tx.feature.create({
        data: {
          tenantId: input.tenantId,
          initiativeId,
          title: draft.title.slice(0, 500),
          description: description || null,
          acceptanceCriteria: acceptanceCriteriaText,
          labels,
          storyType,
          status: FeatureStatus.IDEA,
          ownerId: input.userId,
          sortOrder: 0
        }
      });

      result.features.push({
        draftKey: draft.key,
        id: feature.id,
        title: feature.title,
        storyType: feature.storyType
      });
      featureInitiativePairs.push({ featureId: feature.id, initiativeId });

      const reqs = requirementTitlesFromDraft(draft);
      let sortOrder = 0;
      for (const req of reqs) {
        const created = await tx.requirement.create({
          data: {
            tenantId: input.tenantId,
            featureId: feature.id,
            title: req.title,
            description: req.description || null,
            priority: hubPriorityEnum(hubPriority),
            status: "NOT_STARTED",
            isDone: false,
            sortOrder: sortOrder++,
            metadata: {
              intakeSessionId: input.sessionId,
              intakeDraftKey: draft.key,
              intakeRequirementKey: req.key
            }
          }
        });
        result.requirements.push({
          draftKey: req.key,
          id: created.id,
          title: created.title,
          featureId: feature.id
        });
      }

      const sessionLinks = await tx.attachmentLink.findMany({
        where: { tenantId: input.tenantId, intakeSessionId: input.sessionId },
        select: { attachmentId: true, role: true, createdByUserId: true }
      });
      for (const link of sessionLinks) {
        await tx.attachmentLink.create({
          data: {
            tenantId: input.tenantId,
            attachmentId: link.attachmentId,
            featureId: feature.id,
            role: link.role,
            createdByUserId: link.createdByUserId
          }
        });
      }
    }
  });

  for (const init of result.initiatives) {
    notifyHubChange({
      tenantId: input.tenantId,
      entityType: "INITIATIVE",
      operation: "CREATE",
      entityId: init.id,
      initiativeId: init.id
    });
  }
  for (const pair of featureInitiativePairs) {
    notifyHubChange({
      tenantId: input.tenantId,
      entityType: "FEATURE",
      operation: "CREATE",
      entityId: pair.featureId,
      initiativeId: pair.initiativeId
    });
  }

  return { ok: true, result, createdNewInitiative };
}
