import { prisma } from "../db.js";
import { ATLAS_CURATOR_AGENT_ID, ATLAS_CURATOR_MAX_TOPICS_PER_RUN } from "./constants.js";
import { buildCuratorTopicContext, loadCuratorTopicIds } from "./context.js";
import type { AtlasCuratorLlm } from "./llm.js";
import { createAtlasCuratorLlmFromEnv } from "./llm.js";
import { intakeCuratorProposals, type IntakeItemResult } from "./intake.js";
import { parseCuratorLlmResponse } from "./parseResponse.js";
import { CURATOR_SYSTEM_PROMPT, buildCuratorUserPrompt } from "./prompt.js";

export type CuratorRunTopicResult = {
  architectureTopicId: string;
  slug: string | null;
  proposalsFromLlm: number;
  created: number;
  skipped: number;
  intake: IntakeItemResult[];
  error?: string;
};

export type CuratorRunResult = {
  agent: typeof ATLAS_CURATOR_AGENT_ID;
  topicsProcessed: number;
  topicsTruncated: boolean;
  created: number;
  skipped: number;
  proposalIds: string[];
  topics: CuratorRunTopicResult[];
  errors: Array<{ architectureTopicId: string; message: string }>;
};

export async function runAtlasCurator(options: {
  tenantId: string;
  architectureTopicId?: string;
  llm?: AtlasCuratorLlm;
  maxTopics?: number;
}): Promise<CuratorRunResult> {
  const llm = options.llm ?? createAtlasCuratorLlmFromEnv();
  const maxTopics = options.maxTopics ?? ATLAS_CURATOR_MAX_TOPICS_PER_RUN;

  const topicIds = await loadCuratorTopicIds(options.tenantId, options.architectureTopicId);
  const topicsTruncated = topicIds.length > maxTopics;
  const selectedIds = topicIds.slice(0, maxTopics);

  const result: CuratorRunResult = {
    agent: ATLAS_CURATOR_AGENT_ID,
    topicsProcessed: 0,
    topicsTruncated,
    created: 0,
    skipped: 0,
    proposalIds: [],
    topics: [],
    errors: []
  };

  for (const topicId of selectedIds) {
    const ctx = await buildCuratorTopicContext(options.tenantId, topicId);
    if (!ctx) {
      result.errors.push({ architectureTopicId: topicId, message: "Architecture topic not found" });
      continue;
    }

    const topicResult: CuratorRunTopicResult = {
      architectureTopicId: topicId,
      slug: ctx.topic.slug,
      proposalsFromLlm: 0,
      created: 0,
      skipped: 0,
      intake: []
    };

    try {
      const raw = await llm.completeJson(CURATOR_SYSTEM_PROMPT, buildCuratorUserPrompt(topicId, ctx));
      const proposals = parseCuratorLlmResponse(raw);
      topicResult.proposalsFromLlm = proposals.length;

      const intake = await intakeCuratorProposals(prisma, topicId, ctx.topic, proposals);
      topicResult.created = intake.created;
      topicResult.skipped = intake.skipped;
      topicResult.intake = intake.results;
      result.created += intake.created;
      result.skipped += intake.skipped;
      result.proposalIds.push(...intake.proposalIds);
      result.topicsProcessed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      topicResult.error = message;
      result.errors.push({ architectureTopicId: topicId, message });
    }

    result.topics.push(topicResult);
  }

  return result;
}
