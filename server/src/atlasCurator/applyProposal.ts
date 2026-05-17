import {
  AtlasCuratorProposalStatus,
  AtlasCuratorProposalType,
  Prisma,
  type AtlasCuratorProposal,
  type ArchitectureTopic
} from "@prisma/client";
import {
  fieldIsLocked,
  gapReportValueSchema,
  linkProposalValueSchema,
  topicLayerPatchValueSchema,
  type CuratorProposalPayload
} from "./schemas.js";

export class ProposalApplyError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "LOCKED" | "INVALID" | "WRONG_STATUS"
  ) {
    super(message);
  }
}

function parseProposedPatch(value: unknown) {
  const parsed = topicLayerPatchValueSchema.safeParse(value);
  if (!parsed.success) throw new ProposalApplyError("Invalid topic layer patch payload", "INVALID");
  return parsed.data;
}

function parseLinkProposal(value: unknown) {
  const parsed = linkProposalValueSchema.safeParse(value);
  if (!parsed.success) throw new ProposalApplyError("Invalid link proposal payload", "INVALID");
  return parsed.data;
}

type CuratorApplyTx = Pick<
  Prisma.TransactionClient,
  "architectureTopic" | "architectureTopicInitiative" | "architectureTopicCapability"
>;

export type { CuratorApplyTx };

export async function applyAcceptedProposal(
  tx: CuratorApplyTx,
  proposal: AtlasCuratorProposal,
  finalProposedValue?: unknown
): Promise<void> {
  if (proposal.status !== AtlasCuratorProposalStatus.PENDING) {
    throw new ProposalApplyError("Proposal is not pending", "WRONG_STATUS");
  }

  const proposedValue = finalProposedValue ?? proposal.proposedValue;

  if (proposal.proposalType === AtlasCuratorProposalType.GAP_REPORT) {
    return;
  }

  if (!proposal.architectureTopicId) {
    throw new ProposalApplyError("Missing architecture topic target", "INVALID");
  }

  const topic = await tx.architectureTopic.findUnique({
    where: { id: proposal.architectureTopicId }
  });
  if (!topic) throw new ProposalApplyError("Architecture topic not found", "NOT_FOUND");

  if (proposal.proposalType === AtlasCuratorProposalType.TOPIC_LAYER_PATCH) {
    const patch = parseProposedPatch(proposedValue);
    const field = patch.field;
    if (fieldIsLocked(topic.lockedFields, field)) {
      throw new ProposalApplyError(`Field ${field} is human-locked`, "LOCKED");
    }
    const data: Prisma.ArchitectureTopicUpdateInput = {};
    if (field === "asIsSummary" || field === "toBeSummary" || field === "title") {
      data[field] = String(patch.value);
    } else if (field === "synonyms" || field === "docPaths") {
      data[field] = Array.isArray(patch.value) ? patch.value : [];
    }
    await tx.architectureTopic.update({ where: { id: topic.id }, data });
    return;
  }

  if (proposal.proposalType === AtlasCuratorProposalType.LINK_PROPOSAL) {
    const link = parseLinkProposal(proposedValue);
    if (link.linkType === "initiative") {
      if (link.action === "add") {
        await tx.architectureTopicInitiative.upsert({
          where: {
            architectureTopicId_initiativeId: {
              architectureTopicId: topic.id,
              initiativeId: link.targetId
            }
          },
          create: { architectureTopicId: topic.id, initiativeId: link.targetId },
          update: {}
        });
      } else {
        await tx.architectureTopicInitiative.deleteMany({
          where: { architectureTopicId: topic.id, initiativeId: link.targetId }
        });
      }
      return;
    }
    if (link.linkType === "capability") {
      if (link.action === "add") {
        await tx.architectureTopicCapability.upsert({
          where: {
            architectureTopicId_capabilityId: {
              architectureTopicId: topic.id,
              capabilityId: link.targetId
            }
          },
          create: { architectureTopicId: topic.id, capabilityId: link.targetId },
          update: {}
        });
      } else {
        await tx.architectureTopicCapability.deleteMany({
          where: { architectureTopicId: topic.id, capabilityId: link.targetId }
        });
      }
    }
  }
}

export function buildCurrentValueForTopicField(
  topic: ArchitectureTopic,
  field: string
): unknown | null {
  if (field === "asIsSummary" || field === "toBeSummary" || field === "title" || field === "slug") {
    return { field, value: topic[field as keyof ArchitectureTopic] ?? "" };
  }
  if (field === "synonyms" || field === "docPaths") {
    const raw = topic[field as keyof ArchitectureTopic];
    return { field, value: Array.isArray(raw) ? raw : [] };
  }
  return null;
}

export function curatorPayloadToCreateData(
  payload: CuratorProposalPayload
): Prisma.AtlasCuratorProposalUncheckedCreateInput {
  return {
    proposalType: payload.proposalType as AtlasCuratorProposalType,
    architectureTopicId: payload.architectureTopicId,
    fieldPath:
      payload.proposalType === "TOPIC_LAYER_PATCH"
        ? payload.proposedValue.field
        : payload.fieldPath ?? null,
    currentValue:
      payload.currentValue === undefined
        ? Prisma.JsonNull
        : (payload.currentValue as Prisma.InputJsonValue),
    proposedValue: payload.proposedValue as Prisma.InputJsonValue,
    sources: payload.sources as Prisma.InputJsonValue,
    confidence: payload.confidence ?? null,
    createdByAgent: payload.createdByAgent
  };
}

export function gapReportAcknowledged(_value: unknown): boolean {
  return gapReportValueSchema.safeParse(_value).success;
}
