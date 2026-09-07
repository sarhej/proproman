import { z } from "zod";

export const hubEntityTypeSchema = z.enum(["Initiative", "Feature", "Requirement"]);
export const planTypeSchema = z.enum([
  "SINGLE_FEATURE",
  "SINGLE_BUG_FEATURE",
  "MULTI_ITEMS",
  "INITIATIVE_TREE",
  "MIXED"
]);
export const storyTypeSchema = z.enum(["FUNCTIONAL", "BUG", "TECH_DEBT", "RESEARCH"]).nullable();
export const suggestedPrioritySchema = z
  .enum(["P0", "P1", "P2", "P3", "DISCOVERY"])
  .nullable();
export const bugSeveritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).nullable();

export const clarificationQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  choices: z.array(z.string()).optional()
});

export const planItemSchema = z.object({
  key: z.string().min(1),
  hubEntityType: hubEntityTypeSchema,
  title: z.string().min(1).max(500),
  parentKey: z.string().nullable().optional(),
  storyType: storyTypeSchema.optional(),
  suggestedPriority: suggestedPrioritySchema.optional(),
  bugSeverity: bugSeveritySchema.optional(),
  routeHint: z
    .object({
      initiativeId: z.string().nullable().optional(),
      featureId: z.string().nullable().optional(),
      rationale: z.string().optional()
    })
    .optional()
});

export const creationPlanSchema = z.object({
  planType: planTypeSchema,
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
  needsClarification: z.boolean().optional(),
  clarificationQuestions: z.array(clarificationQuestionSchema).max(3).optional(),
  items: z.array(planItemSchema).min(1)
});

export type CreationPlan = z.infer<typeof creationPlanSchema>;
export type PlanItem = z.infer<typeof planItemSchema>;
export type ClarificationQuestion = z.infer<typeof clarificationQuestionSchema>;

/** Ensure parentKey references exist and Initiative parents precede children. */
export function normalizeCreationPlan(plan: CreationPlan): CreationPlan {
  const keys = new Set(plan.items.map((i) => i.key));
  const items = plan.items.map((item) => {
    if (item.parentKey && !keys.has(item.parentKey)) {
      return { ...item, parentKey: null };
    }
    if (item.hubEntityType === "Initiative") {
      return { ...item, parentKey: null, storyType: item.storyType ?? null };
    }
    if (item.hubEntityType === "Feature" && item.storyType === undefined) {
      return { ...item, storyType: "FUNCTIONAL" as const };
    }
    return item;
  });

  // Initiatives first, then features, then requirements (stable within type)
  const rank = (t: string) => (t === "Initiative" ? 0 : t === "Feature" ? 1 : 2);
  items.sort((a, b) => rank(a.hubEntityType) - rank(b.hubEntityType));

  return creationPlanSchema.parse({ ...plan, items });
}
