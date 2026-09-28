import { z } from "zod";
import { approvalSchema, fieldProvenanceSchema } from "./bugDraftSchema.js";

export const featurePrioritySchema = z.enum(["P0", "P1", "P2", "P3", "DISCOVERY"]);
export const featureStoryTypeSchema = z.enum(["FUNCTIONAL", "TECH_DEBT", "RESEARCH"]);

/**
 * Phase 5 commit mapping:
 * DISCOVERY draft priority → Feature storyType RESEARCH, hub priority P3.
 * Otherwise keep draft storyType and P0–P3 priority for Requirements/labels.
 */
export function resolveFeatureCommitStoryAndPriority(draft: {
  priority: z.infer<typeof featurePrioritySchema>;
  storyType: z.infer<typeof featureStoryTypeSchema>;
}): {
  storyType: z.infer<typeof featureStoryTypeSchema>;
  hubPriority: "P0" | "P1" | "P2" | "P3";
} {
  if (draft.priority === "DISCOVERY") {
    return { storyType: "RESEARCH", hubPriority: "P3" };
  }
  return { storyType: draft.storyType, hubPriority: draft.priority };
}

/** @deprecated use resolveFeatureCommitStoryAndPriority */
export function discoveryCommitMapping(priority: z.infer<typeof featurePrioritySchema>): {
  storyType: z.infer<typeof featureStoryTypeSchema>;
  hubPriority: "P0" | "P1" | "P2" | "P3";
} {
  return resolveFeatureCommitStoryAndPriority({
    priority,
    storyType: priority === "DISCOVERY" ? "RESEARCH" : "FUNCTIONAL"
  });
}

export const featureRequirementDraftSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).optional().default(""),
  approval: approvalSchema.default("pending")
});

export const featureDraftSchema = z.object({
  key: z.string().min(1),
  hubEntityType: z.literal("Feature"),
  storyType: featureStoryTypeSchema.default("FUNCTIONAL"),
  approval: approvalSchema.default("pending"),
  fieldProvenance: z
    .object({
      title: fieldProvenanceSchema.optional(),
      problem: fieldProvenanceSchema.optional(),
      solution: fieldProvenanceSchema.optional(),
      personas: fieldProvenanceSchema.optional(),
      businessValue: fieldProvenanceSchema.optional(),
      priority: fieldProvenanceSchema.optional(),
      priorityRationale: fieldProvenanceSchema.optional(),
      missingInputs: fieldProvenanceSchema.optional(),
      acceptanceCriteria: fieldProvenanceSchema.optional(),
      dependencies: fieldProvenanceSchema.optional(),
      risks: fieldProvenanceSchema.optional(),
      openQuestions: fieldProvenanceSchema.optional()
    })
    .default({}),
  title: z.string().min(1).max(500),
  problem: z.string().max(20_000).default(""),
  solution: z.string().max(20_000).default(""),
  personas: z.array(z.string().max(500)).default([]),
  businessValue: z.string().max(5000).default(""),
  priority: featurePrioritySchema,
  priorityRationale: z.string().max(5000).default(""),
  missingInputs: z.array(z.string().max(2000)).default([]),
  acceptanceCriteria: z.array(z.string().max(2000)).default([]),
  dependencies: z.array(z.string().max(2000)).default([]),
  risks: z.array(z.string().max(2000)).default([]),
  openQuestions: z.array(z.string().max(2000)).default([]),
  parentKey: z.string().nullable().optional(),
  route: z
    .object({
      initiativeId: z.string().nullable().optional(),
      featureId: z.string().nullable().optional()
    })
    .optional()
    .default({ initiativeId: null, featureId: null }),
  requirements: z.array(featureRequirementDraftSchema).default([])
});

export const featureIntakeDraftsSchema = z.object({
  items: z.array(featureDraftSchema).min(1),
  source: z.enum(["heuristic", "llm"]).optional(),
  generatedAt: z.string().optional()
});

export type FeatureDraft = z.infer<typeof featureDraftSchema>;
export type FeatureIntakeDrafts = z.infer<typeof featureIntakeDraftsSchema>;
export type FeaturePriority = z.infer<typeof featurePrioritySchema>;

/** If priority is DISCOVERY and storyType still AI-default FUNCTIONAL, prefer RESEARCH for display consistency. */
export function normalizeFeatureDraft(draft: FeatureDraft): FeatureDraft {
  const storyIsAi = true; // storyType provenance not tracked separately; align with priority when Discovery
  let storyType = draft.storyType;
  if (draft.priority === "DISCOVERY" && storyIsAi && draft.storyType === "FUNCTIONAL") {
    const priorityIsAi = (draft.fieldProvenance.priority ?? "ai") === "ai";
    if (priorityIsAi || draft.fieldProvenance.priority === "user") {
      // Discovery drafts display as RESEARCH-oriented until Phase 5 commit
      storyType = "RESEARCH";
    }
  }
  return featureDraftSchema.parse({
    ...draft,
    storyType,
    hubEntityType: "Feature"
  });
}

export function normalizeFeatureIntakeDrafts(drafts: FeatureIntakeDrafts): FeatureIntakeDrafts {
  return featureIntakeDraftsSchema.parse({
    ...drafts,
    items: drafts.items.map((d) => normalizeFeatureDraft(d))
  });
}
