import { GitActivityKind, type RepositoryConnection } from "@prisma/client";
import { prismaUnscoped } from "../db.js";

export type GitActivityDraft = {
  kind: GitActivityKind;
  action?: string | null;
  deliveryId?: string | null;
  branch?: string | null;
  title?: string | null;
  authorLogin?: string | null;
  externalUrl?: string | null;
  commitSha?: string | null;
  prNumber?: number | null;
  occurredAt: Date;
};

export async function recordWebhookReceipt(
  connection: Pick<RepositoryConnection, "id" | "tenantId">,
  eventType: string,
  error?: string | null
): Promise<void> {
  await prismaUnscoped.repositoryConnection.update({
    where: { id: connection.id },
    data: {
      lastWebhookReceivedAt: new Date(),
      lastWebhookEventType: eventType,
      lastWebhookError: error ?? null
    }
  });
}

/** Read-only ingest: never mutates backlog rows. */
export async function ingestGitActivity(
  connection: Pick<RepositoryConnection, "id" | "tenantId">,
  draft: GitActivityDraft
): Promise<void> {
  if (!draft.deliveryId) {
    await prismaUnscoped.gitActivity.create({
      data: {
        tenantId: connection.tenantId,
        repositoryConnectionId: connection.id,
        kind: draft.kind,
        action: draft.action ?? null,
        deliveryId: null,
        branch: draft.branch ?? null,
        title: draft.title ?? null,
        authorLogin: draft.authorLogin ?? null,
        externalUrl: draft.externalUrl ?? null,
        commitSha: draft.commitSha ?? null,
        prNumber: draft.prNumber ?? null,
        occurredAt: draft.occurredAt
      }
    });
    return;
  }

  await prismaUnscoped.gitActivity.upsert({
    where: {
      repositoryConnectionId_deliveryId: {
        repositoryConnectionId: connection.id,
        deliveryId: draft.deliveryId
      }
    },
    create: {
      tenantId: connection.tenantId,
      repositoryConnectionId: connection.id,
      kind: draft.kind,
      action: draft.action ?? null,
      deliveryId: draft.deliveryId,
      branch: draft.branch ?? null,
      title: draft.title ?? null,
      authorLogin: draft.authorLogin ?? null,
      externalUrl: draft.externalUrl ?? null,
      commitSha: draft.commitSha ?? null,
      prNumber: draft.prNumber ?? null,
      occurredAt: draft.occurredAt
    },
    update: {
      action: draft.action ?? null,
      branch: draft.branch ?? null,
      title: draft.title ?? null,
      authorLogin: draft.authorLogin ?? null,
      externalUrl: draft.externalUrl ?? null,
      commitSha: draft.commitSha ?? null,
      prNumber: draft.prNumber ?? null,
      occurredAt: draft.occurredAt
    }
  });
}

export function parseGithubWebhookActivities(
  eventName: string | undefined,
  deliveryId: string | undefined,
  json: Record<string, unknown>
): GitActivityDraft[] {
  const drafts: GitActivityDraft[] = [];
  const now = new Date();

  if (eventName === "push") {
    const ref = typeof json.ref === "string" ? json.ref.replace(/^refs\/heads\//, "") : null;
    const head = json.head_commit as Record<string, unknown> | undefined;
    const pusher = json.pusher as Record<string, unknown> | undefined;
    drafts.push({
      kind: GitActivityKind.PUSH,
      action: "push",
      deliveryId: deliveryId ? `push:${deliveryId}` : null,
      branch: ref,
      title: head && typeof head.message === "string" ? head.message.split("\n")[0] : `Push to ${ref ?? "branch"}`,
      authorLogin: pusher && typeof pusher.name === "string" ? pusher.name : null,
      externalUrl: head && typeof head.url === "string" ? head.url : null,
      commitSha: head && typeof head.id === "string" ? head.id : null,
      occurredAt: head?.timestamp ? new Date(String(head.timestamp)) : now
    });
    return drafts;
  }

  if (eventName === "pull_request") {
    const action = typeof json.action === "string" ? json.action : "updated";
    const pr = json.pull_request as Record<string, unknown> | undefined;
    if (!pr) return drafts;
    const user = pr.user as Record<string, unknown> | undefined;
    const head = pr.head as Record<string, unknown> | undefined;
    drafts.push({
      kind: GitActivityKind.PULL_REQUEST,
      action,
      deliveryId: deliveryId ? `pr:${deliveryId}` : null,
      branch: head && typeof head.ref === "string" ? head.ref : null,
      title: typeof pr.title === "string" ? pr.title : null,
      authorLogin: user && typeof user.login === "string" ? user.login : null,
      externalUrl: typeof pr.html_url === "string" ? pr.html_url : null,
      commitSha: head && typeof head.sha === "string" ? head.sha : null,
      prNumber: typeof pr.number === "number" ? pr.number : null,
      occurredAt: pr.updated_at ? new Date(String(pr.updated_at)) : now
    });
    return drafts;
  }

  return drafts;
}

export function parseGitlabWebhookActivities(
  eventName: string | undefined,
  deliveryId: string | undefined,
  json: Record<string, unknown>
): GitActivityDraft[] {
  const drafts: GitActivityDraft[] = [];
  const now = new Date();

  if (eventName === "Push Hook") {
    const ref = typeof json.ref === "string" ? json.ref.replace(/^refs\/heads\//, "") : null;
    const commits = Array.isArray(json.commits) ? json.commits : [];
    const last = commits[commits.length - 1] as Record<string, unknown> | undefined;
    const user = json.user_name;
    drafts.push({
      kind: GitActivityKind.PUSH,
      action: "push",
      deliveryId: deliveryId ? `push:${deliveryId}` : null,
      branch: ref,
      title: last && typeof last.message === "string" ? last.message.split("\n")[0] : `Push to ${ref ?? "branch"}`,
      authorLogin: typeof user === "string" ? user : null,
      externalUrl: last && typeof last.url === "string" ? last.url : null,
      commitSha: last && typeof last.id === "string" ? last.id : null,
      occurredAt: now
    });
    return drafts;
  }

  if (eventName === "Merge Request Hook") {
    const attrs = json.object_attributes as Record<string, unknown> | undefined;
    if (!attrs) return drafts;
    const user = json.user as Record<string, unknown> | undefined;
    const lastCommit = attrs.last_commit as Record<string, unknown> | undefined;
    drafts.push({
      kind: GitActivityKind.PULL_REQUEST,
      action: typeof attrs.action === "string" ? attrs.action : "update",
      deliveryId: deliveryId ? `mr:${deliveryId}` : null,
      branch: typeof attrs.source_branch === "string" ? attrs.source_branch : null,
      title: typeof attrs.title === "string" ? attrs.title : null,
      authorLogin: user && typeof user.username === "string" ? user.username : null,
      externalUrl: typeof attrs.url === "string" ? attrs.url : null,
      commitSha: lastCommit && typeof lastCommit.id === "string" ? lastCommit.id : null,
      prNumber: typeof attrs.iid === "number" ? attrs.iid : null,
      occurredAt: attrs.updated_at ? new Date(String(attrs.updated_at)) : now
    });
    return drafts;
  }

  return drafts;
}
