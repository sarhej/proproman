import { z } from "zod";
import {
  gapReportValueSchema,
  linkProposalValueSchema,
  sourceCitationSchema,
  topicLayerPatchValueSchema
} from "./schemas.js";

const curatorLlmProposalSchema = z.discriminatedUnion("proposalType", [
  z
    .object({
      proposalType: z.literal("TOPIC_LAYER_PATCH"),
      fieldPath: z.string().min(1).optional(),
      proposedValue: topicLayerPatchValueSchema,
      sources: z.array(sourceCitationSchema).min(1),
      confidence: z.number().min(0).max(1).nullable().optional()
    })
    .strict(),
  z
    .object({
      proposalType: z.literal("LINK_PROPOSAL"),
      fieldPath: z.string().nullable().optional(),
      proposedValue: linkProposalValueSchema,
      sources: z.array(sourceCitationSchema).min(1),
      confidence: z.number().min(0).max(1).nullable().optional()
    })
    .strict(),
  z
    .object({
      proposalType: z.literal("GAP_REPORT"),
      fieldPath: z.string().nullable().optional(),
      proposedValue: gapReportValueSchema,
      sources: z.array(sourceCitationSchema).min(1),
      confidence: z.number().min(0).max(1).nullable().optional()
    })
    .strict()
]);

export const curatorLlmResponseSchema = z
  .object({
    proposals: z.array(curatorLlmProposalSchema)
  })
  .strict();

export type CuratorLlmProposal = z.infer<typeof curatorLlmProposalSchema>;

export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return fence ? fence[1].trim() : trimmed;
}

export function parseCuratorLlmResponse(raw: string): CuratorLlmProposal[] {
  const jsonText = stripJsonFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Curator LLM response is not valid JSON");
  }
  const result = curatorLlmResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Curator LLM response failed schema validation: ${result.error.message}`);
  }
  return result.data.proposals;
}
