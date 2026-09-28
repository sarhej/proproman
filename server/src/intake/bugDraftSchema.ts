import { z } from "zod";

export const approvalSchema = z.enum(["pending", "approved", "skipped"]);
export const fieldProvenanceSchema = z.enum(["ai", "user"]);

export const bugSeverityRequiredSchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
export const bugPrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);

export const severityToPriority = (
  severity: z.infer<typeof bugSeverityRequiredSchema>
): z.infer<typeof bugPrioritySchema> => {
  const map = { CRITICAL: "P0", HIGH: "P1", MEDIUM: "P2", LOW: "P3" } as const;
  return map[severity];
};

export const bugRequirementDraftSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).optional().default(""),
  approval: approvalSchema.default("pending")
});

export const bugDraftSchema = z.object({
  key: z.string().min(1),
  hubEntityType: z.literal("Feature"),
  storyType: z.literal("BUG"),
  approval: approvalSchema.default("pending"),
  fieldProvenance: z
    .object({
      title: fieldProvenanceSchema.optional(),
      description: fieldProvenanceSchema.optional(),
      severity: fieldProvenanceSchema.optional(),
      priority: fieldProvenanceSchema.optional(),
      stepsToReproduce: fieldProvenanceSchema.optional(),
      expected: fieldProvenanceSchema.optional(),
      actual: fieldProvenanceSchema.optional(),
      environment: fieldProvenanceSchema.optional(),
      acceptanceCriteria: fieldProvenanceSchema.optional(),
      affectedArea: fieldProvenanceSchema.optional()
    })
    .default({}),
  title: z.string().min(1).max(500),
  description: z.string().max(50_000).default(""),
  stepsToReproduce: z.array(z.string().max(2000)).default([]),
  expected: z.string().max(5000).default(""),
  actual: z.string().max(5000).default(""),
  environment: z.string().max(2000).default(""),
  severity: bugSeverityRequiredSchema,
  priority: bugPrioritySchema,
  acceptanceCriteria: z.array(z.string().max(2000)).default([]),
  affectedArea: z.string().max(500).default(""),
  parentKey: z.string().nullable().optional(),
  route: z
    .object({
      initiativeId: z.string().nullable().optional(),
      featureId: z.string().nullable().optional()
    })
    .optional()
    .default({ initiativeId: null, featureId: null }),
  requirements: z.array(bugRequirementDraftSchema).default([])
});

export const intakeDraftsSchema = z.object({
  items: z.array(bugDraftSchema).min(1),
  source: z.enum(["heuristic", "llm"]).optional(),
  generatedAt: z.string().optional()
});

export type BugDraft = z.infer<typeof bugDraftSchema>;
export type BugRequirementDraft = z.infer<typeof bugRequirementDraftSchema>;
export type IntakeDrafts = z.infer<typeof intakeDraftsSchema>;
export type BugSeverity = z.infer<typeof bugSeverityRequiredSchema>;
export type BugPriority = z.infer<typeof bugPrioritySchema>;

/**
 * When severity changes and priority is still AI-owned, re-map priority from severity.
 * User-overridden priority is preserved.
 */
export function normalizeBugDraft(draft: BugDraft): BugDraft {
  const priorityIsAi = (draft.fieldProvenance.priority ?? "ai") === "ai";
  const nextPriority = priorityIsAi ? severityToPriority(draft.severity) : draft.priority;
  return bugDraftSchema.parse({
    ...draft,
    priority: nextPriority,
    storyType: "BUG",
    hubEntityType: "Feature"
  });
}

export function normalizeIntakeDrafts(drafts: IntakeDrafts): IntakeDrafts {
  return intakeDraftsSchema.parse({
    ...drafts,
    items: drafts.items.map((d) => normalizeBugDraft(d))
  });
}
