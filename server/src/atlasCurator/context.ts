import type { ArchitectureTopic, GitActivity } from "@prisma/client";
import { prisma } from "../db.js";
import { readObjectShard } from "../workspaceAtlas/store.js";
import { ATLAS_CURATOR_GIT_ACTIVITY_LIMIT } from "./constants.js";
import { parseLockedFields } from "./schemas.js";

export type CuratorTopicContext = {
  topic: Pick<
    ArchitectureTopic,
    | "id"
    | "slug"
    | "title"
    | "asIsSummary"
    | "toBeSummary"
    | "synonyms"
    | "docPaths"
    | "lockedFields"
    | "autoMatchCapabilities"
  >;
  lockedFields: string[];
  compiledShard: Record<string, unknown> | null;
  recentGitActivity: Array<{
    kind: string;
    title: string | null;
    externalUrl: string | null;
    branch: string | null;
    occurredAt: string;
    repo: string;
  }>;
};

export async function loadCuratorTopicIds(
  tenantId: string,
  architectureTopicId?: string
): Promise<string[]> {
  if (architectureTopicId) return [architectureTopicId];
  const rows = await prisma.architectureTopic.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: { id: true }
  });
  return rows.map((r) => r.id);
}

export async function buildCuratorTopicContext(
  tenantId: string,
  topicId: string
): Promise<CuratorTopicContext | null> {
  const topic = await prisma.architectureTopic.findFirst({
    where: { id: topicId, tenantId },
    select: {
      id: true,
      slug: true,
      title: true,
      asIsSummary: true,
      toBeSummary: true,
      synonyms: true,
      docPaths: true,
      lockedFields: true,
      autoMatchCapabilities: true
    }
  });
  if (!topic) return null;

  const shard = await readObjectShard(tenantId, "ARCHITECTURE_TOPIC", topicId);
  const activities = await prisma.gitActivity.findMany({
    where: { tenantId },
    orderBy: { occurredAt: "desc" },
    take: ATLAS_CURATOR_GIT_ACTIVITY_LIMIT,
    include: {
      repositoryConnection: { select: { owner: true, repo: true } }
    }
  });

  return {
    topic,
    lockedFields: parseLockedFields(topic.lockedFields),
    compiledShard: shard ? { facts: shard.facts, graph: shard.graph, summary: shard.summary ?? null } : null,
    recentGitActivity: activities.map((a: GitActivity & { repositoryConnection: { owner: string; repo: string } }) => ({
      kind: a.kind,
      title: a.title,
      externalUrl: a.externalUrl,
      branch: a.branch,
      occurredAt: a.occurredAt.toISOString(),
      repo: `${a.repositoryConnection.owner}/${a.repositoryConnection.repo}`
    }))
  };
}
