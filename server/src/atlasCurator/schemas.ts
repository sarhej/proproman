import { z } from "zod";

export const sourceCitationSchema = z
  .object({
    kind: z.enum(["doc", "hub", "git", "mcp", "human", "other"]),
    ref: z.string().min(1),
    excerpt: z.string().nullable().optional(),
    url: z.string().nullable().optional()
  })
  .strict();

export type SourceCitation = z.infer<typeof sourceCitationSchema>;

export const topicLayerPatchValueSchema = z
  .object({
    field: z.enum(["asIsSummary", "toBeSummary", "synonyms", "docPaths", "title"]),
    value: z.union([z.string(), z.array(z.string())])
  })
  .strict();

export const linkProposalValueSchema = z
  .object({
    linkType: z.enum(["initiative", "capability"]),
    action: z.enum(["add", "remove"]),
    targetId: z.string().min(1)
  })
  .strict();

export const gapReportValueSchema = z
  .object({
    kind: z.string().min(1),
    message: z.string().min(1),
    suggestedAction: z.string().nullable().optional()
  })
  .strict();

export const curatorProposalPayloadSchema = z.discriminatedUnion("proposalType", [
  z
    .object({
      proposalType: z.literal("TOPIC_LAYER_PATCH"),
      architectureTopicId: z.string().min(1),
      fieldPath: z.string().min(1),
      currentValue: topicLayerPatchValueSchema.nullable().optional(),
      proposedValue: topicLayerPatchValueSchema,
      sources: z.array(sourceCitationSchema).min(1),
      confidence: z.number().min(0).max(1).nullable().optional(),
      createdByAgent: z.string().min(1)
    })
    .strict(),
  z
    .object({
      proposalType: z.literal("LINK_PROPOSAL"),
      architectureTopicId: z.string().min(1),
      fieldPath: z.string().nullable().optional(),
      currentValue: linkProposalValueSchema.nullable().optional(),
      proposedValue: linkProposalValueSchema,
      sources: z.array(sourceCitationSchema).min(1),
      confidence: z.number().min(0).max(1).nullable().optional(),
      createdByAgent: z.string().min(1)
    })
    .strict(),
  z
    .object({
      proposalType: z.literal("GAP_REPORT"),
      architectureTopicId: z.string().min(1),
      fieldPath: z.string().nullable().optional(),
      currentValue: z.unknown().optional(),
      proposedValue: gapReportValueSchema,
      sources: z.array(sourceCitationSchema).min(1),
      confidence: z.number().min(0).max(1).nullable().optional(),
      createdByAgent: z.string().min(1)
    })
    .strict()
]);

export type CuratorProposalPayload = z.infer<typeof curatorProposalPayloadSchema>;

export const LOCKABLE_TOPIC_FIELDS = [
  "asIsSummary",
  "toBeSummary",
  "synonyms",
  "docPaths",
  "title",
  "slug"
] as const;

export type LockableTopicField = (typeof LOCKABLE_TOPIC_FIELDS)[number];

export function parseLockedFields(json: unknown): LockableTopicField[] {
  if (!Array.isArray(json)) return [];
  return json.filter((x): x is LockableTopicField =>
    typeof x === "string" && (LOCKABLE_TOPIC_FIELDS as readonly string[]).includes(x)
  );
}

export function fieldIsLocked(lockedFields: unknown, fieldPath: string | null | undefined): boolean {
  if (!fieldPath) return false;
  return parseLockedFields(lockedFields).includes(fieldPath as LockableTopicField);
}
