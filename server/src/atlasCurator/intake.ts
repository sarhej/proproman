import { AtlasCuratorProposalStatus, type ArchitectureTopic, type Prisma } from "@prisma/client";
import type { ExtendedPrismaClient } from "../db.js";
import {
  buildCurrentValueForTopicField,
  curatorPayloadToCreateData
} from "./applyProposal.js";
import { ATLAS_CURATOR_AGENT_ID } from "./constants.js";
import type { CuratorLlmProposal } from "./parseResponse.js";
import {
  curatorProposalPayloadSchema,
  fieldIsLocked,
  type CuratorProposalPayload
} from "./schemas.js";

export type IntakeSkipReason =
  | "locked_field"
  | "duplicate_pending"
  | "no_op_patch"
  | "invalid_schema"
  | "topic_not_found";

export type IntakeItemResult =
  | { status: "created"; proposalId: string }
  | { status: "skipped"; reason: IntakeSkipReason; detail?: string };

export type IntakeBatchResult = {
  created: number;
  skipped: number;
  results: IntakeItemResult[];
  proposalIds: string[];
};

function llmProposalToPayload(
  architectureTopicId: string,
  item: CuratorLlmProposal
): Omit<CuratorProposalPayload, "createdByAgent"> & { createdByAgent?: string } {
  const fieldPath =
    item.proposalType === "TOPIC_LAYER_PATCH"
      ? item.proposedValue.field
      : item.fieldPath ?? null;

  return {
    proposalType: item.proposalType,
    architectureTopicId,
    fieldPath,
    proposedValue: item.proposedValue,
    sources: item.sources,
    confidence: item.confidence ?? null
  };
}

function patchValuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type CuratorIntakeTopic = Pick<
  ArchitectureTopic,
  "lockedFields" | "asIsSummary" | "toBeSummary" | "title" | "synonyms" | "docPaths" | "slug"
>;

export async function intakeCuratorProposals(
  db: {
    atlasCuratorProposal: {
      findMany: ExtendedPrismaClient["atlasCuratorProposal"]["findMany"];
      create: ExtendedPrismaClient["atlasCuratorProposal"]["create"];
    };
  },
  architectureTopicId: string,
  topic: CuratorIntakeTopic,
  items: CuratorLlmProposal[]
): Promise<IntakeBatchResult> {
  const results: IntakeItemResult[] = [];
  const proposalIds: string[] = [];
  let created = 0;
  let skipped = 0;

  const pending = await db.atlasCuratorProposal.findMany({
    where: {
      architectureTopicId,
      status: AtlasCuratorProposalStatus.PENDING
    },
    select: { proposalType: true, fieldPath: true, proposedValue: true }
  });

  for (const item of items) {
    if (
      item.proposalType === "TOPIC_LAYER_PATCH" &&
      fieldIsLocked(topic.lockedFields, item.proposedValue.field)
    ) {
      skipped += 1;
      results.push({ status: "skipped", reason: "locked_field", detail: item.proposedValue.field });
      continue;
    }

    const payloadBase = llmProposalToPayload(architectureTopicId, item);
    const payloadParsed = curatorProposalPayloadSchema.safeParse({
      ...payloadBase,
      createdByAgent: ATLAS_CURATOR_AGENT_ID,
      currentValue:
        item.proposalType === "TOPIC_LAYER_PATCH"
          ? buildCurrentValueForTopicField(topic as ArchitectureTopic, item.proposedValue.field)
          : undefined
    });
    if (!payloadParsed.success) {
      skipped += 1;
      results.push({
        status: "skipped",
        reason: "invalid_schema",
        detail: payloadParsed.error.message.slice(0, 200)
      });
      continue;
    }
    const payload = payloadParsed.data;

    if (item.proposalType === "TOPIC_LAYER_PATCH") {
      const current = buildCurrentValueForTopicField(topic as ArchitectureTopic, item.proposedValue.field);
      if (patchValuesEqual(current, item.proposedValue)) {
        skipped += 1;
        results.push({ status: "skipped", reason: "no_op_patch", detail: item.proposedValue.field });
        continue;
      }
    }

    const dup = pending.find(
      (p) =>
        p.proposalType === payload.proposalType &&
        (p.fieldPath ?? null) === (payload.fieldPath ?? null) &&
        JSON.stringify(p.proposedValue) === JSON.stringify(payload.proposedValue)
    );
    if (dup) {
      skipped += 1;
      results.push({ status: "skipped", reason: "duplicate_pending" });
      continue;
    }

    const row = await db.atlasCuratorProposal.create({
      data: curatorPayloadToCreateData(payload) as Prisma.AtlasCuratorProposalUncheckedCreateInput
    });
    created += 1;
    proposalIds.push(row.id);
    results.push({ status: "created", proposalId: row.id });
    pending.push({
      proposalType: row.proposalType,
      fieldPath: row.fieldPath,
      proposedValue: row.proposedValue
    });
  }

  return { created, skipped, results, proposalIds };
}
