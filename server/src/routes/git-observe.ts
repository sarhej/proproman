import { Router } from "express";
import { VcsProvider } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { requireAuth } from "../middleware/auth.js";
import { getTenantId } from "../tenant/requireTenant.js";

function publicApiBase(): string {
  return (env.API_PUBLIC_URL ?? "").replace(/\/$/, "") || `http://127.0.0.1:${env.PORT}`;
}

function webhookUrl(provider: VcsProvider, connectionId: string): string {
  const base = publicApiBase();
  return provider === VcsProvider.GITHUB
    ? `${base}/api/vcs/webhooks/github/${connectionId}`
    : `${base}/api/vcs/webhooks/gitlab/${connectionId}`;
}

export const gitObserveRouter = Router();
gitObserveRouter.use(requireAuth);

gitObserveRouter.get("/health", async (req, res) => {
  const tenantId = getTenantId(req);
  const connections = await prisma.repositoryConnection.findMany({
    where: { tenantId },
    orderBy: [{ owner: "asc" }, { repo: "asc" }],
    include: {
      _count: { select: { gitActivities: true, releases: true } }
    }
  });

  res.json({
    connections: connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      owner: c.owner,
      repo: c.repo,
      displayName: c.displayName,
      webhookUrl: webhookUrl(c.provider, c.id),
      webhookSecretConfigured: Boolean(c.webhookSecret),
      oauthConfigured: Boolean(c.oauthAccessToken),
      lastWebhookReceivedAt: c.lastWebhookReceivedAt?.toISOString() ?? null,
      lastWebhookEventType: c.lastWebhookEventType,
      lastWebhookError: c.lastWebhookError,
      activityCount: c._count.gitActivities,
      releaseCount: c._count.releases
    }))
  });
});

const activityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  connectionId: z.string().optional()
});

gitObserveRouter.get("/activity", async (req, res) => {
  const tenantId = getTenantId(req);
  const parsed = activityQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const limit = parsed.data.limit ?? 30;
  const activities = await prisma.gitActivity.findMany({
    where: {
      tenantId,
      ...(parsed.data.connectionId ? { repositoryConnectionId: parsed.data.connectionId } : {})
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: {
      repositoryConnection: {
        select: { id: true, provider: true, owner: true, repo: true, displayName: true }
      }
    }
  });

  res.json({
    activities: activities.map((a) => ({
      id: a.id,
      kind: a.kind,
      action: a.action,
      branch: a.branch,
      title: a.title,
      authorLogin: a.authorLogin,
      externalUrl: a.externalUrl,
      commitSha: a.commitSha,
      prNumber: a.prNumber,
      occurredAt: a.occurredAt.toISOString(),
      repository: a.repositoryConnection
    }))
  });
});
