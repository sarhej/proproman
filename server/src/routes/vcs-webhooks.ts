import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { GitActivityKind, ReleaseSource, VcsProvider } from "@prisma/client";
import { prismaUnscoped } from "../db.js";
import { notifyAtlasAuxiliaryChange } from "../services/hubChangeHub.js";
import {
  ingestGitActivity,
  parseGithubWebhookActivities,
  parseGitlabWebhookActivities,
  recordWebhookReceipt
} from "../services/gitActivityIngest.js";

function verifyGithubSignature(secret: string, payload: Buffer | string, sigHeader: string | undefined): boolean {
  if (!sigHeader?.startsWith("sha256=")) return false;
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const expected = createHmac("sha256", secret).update(buf).digest("hex");
  const got = sigHeader.slice("sha256=".length);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(got, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function ingestGithubRelease(
  conn: { id: string; tenantId: string | null },
  action: string | undefined,
  release: Record<string, unknown>,
  deliveryId: string | undefined
): Promise<void> {
  if (!release || (action !== "published" && action !== "released")) return;
  const tag = String(release.tag_name ?? "");
  const htmlUrl = String(release.html_url ?? "");
  const name = String(release.name ?? tag);
  if (!tag) return;

  await prismaUnscoped.release.create({
    data: {
      tenantId: conn.tenantId,
      repositoryConnectionId: conn.id,
      tag,
      name,
      releasedAt: release.published_at ? new Date(String(release.published_at)) : new Date(),
      notes: typeof release.body === "string" ? release.body : null,
      source: ReleaseSource.GITHUB,
      externalUrl: htmlUrl || null
    }
  });

  await ingestGitActivity(conn, {
    kind: GitActivityKind.RELEASE,
    action: action ?? "published",
    deliveryId: deliveryId ? `release:${deliveryId}` : null,
    title: name,
    externalUrl: htmlUrl || null,
    occurredAt: release.published_at ? new Date(String(release.published_at)) : new Date()
  });

  if (conn.tenantId) notifyAtlasAuxiliaryChange(conn.tenantId);
}

/** Raw body parser route — `req.body` is Buffer */
export async function githubVcsWebhookHandler(req: Request, res: Response): Promise<void> {
  const connectionId = String(req.params.connectionId ?? "");
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
  const sig = req.header("x-hub-signature-256");
  const eventName = req.header("x-github-event") ?? "unknown";
  const deliveryId = req.header("x-github-delivery") ?? undefined;

  const conn = await prismaUnscoped.repositoryConnection.findUnique({
    where: { id: connectionId }
  });
  if (!conn || conn.provider !== VcsProvider.GITHUB || !conn.webhookSecret) {
    res.status(404).send("Unknown connection");
    return;
  }
  if (!verifyGithubSignature(conn.webhookSecret, raw, sig)) {
    res.status(401).send("Bad signature");
    return;
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  } catch {
    await recordWebhookReceipt(conn, eventName, "Invalid JSON");
    res.status(400).send("Invalid JSON");
    return;
  }

  try {
    const action = json.action as string | undefined;
    const release = json.release as Record<string, unknown> | undefined;
    await ingestGithubRelease(conn, action, release ?? {}, deliveryId);

    const drafts = parseGithubWebhookActivities(eventName, deliveryId, json);
    for (const draft of drafts) {
      await ingestGitActivity(conn, draft);
    }

    await recordWebhookReceipt(conn, eventName, null);
    if (drafts.length > 0 && conn.tenantId) notifyAtlasAuxiliaryChange(conn.tenantId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    await recordWebhookReceipt(conn, eventName, message);
    res.status(500).send("Processing error");
    return;
  }

  res.status(204).send();
}

export async function gitlabVcsWebhookHandler(req: Request, res: Response): Promise<void> {
  const connectionId = String(req.params.connectionId ?? "");
  const token = req.header("x-gitlab-token");
  const eventName = req.header("x-gitlab-event") ?? "unknown";
  const deliveryId = req.header("x-gitlab-event-uuid") ?? req.header("x-gitlab-webhook-uuid") ?? undefined;

  const conn = await prismaUnscoped.repositoryConnection.findUnique({
    where: { id: connectionId }
  });
  if (!conn || conn.provider !== VcsProvider.GITLAB || !conn.webhookSecret) {
    res.status(404).send("Unknown connection");
    return;
  }
  if (token !== conn.webhookSecret) {
    res.status(401).send("Bad token");
    return;
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse((req.body as Buffer).toString("utf8")) as Record<string, unknown>;
  } catch {
    await recordWebhookReceipt(conn, eventName, "Invalid JSON");
    res.status(400).send("Invalid JSON");
    return;
  }

  try {
    if (eventName === "Release Hook" || eventName === "Release") {
      const tag = String(json.tag ?? "");
      const name = String(json.name ?? tag);
      const url = String(json.url ?? "");
      if (tag) {
        await prismaUnscoped.release.create({
          data: {
            tenantId: conn.tenantId,
            repositoryConnectionId: conn.id,
            tag,
            name,
            releasedAt: json.released_at ? new Date(String(json.released_at)) : new Date(),
            notes: typeof json.description === "string" ? json.description : null,
            source: ReleaseSource.GITLAB,
            externalUrl: url || null
          }
        });
        await ingestGitActivity(conn, {
          kind: GitActivityKind.RELEASE,
          action: "released",
          deliveryId: deliveryId ? `release:${deliveryId}` : null,
          title: name,
          externalUrl: url || null,
          occurredAt: json.released_at ? new Date(String(json.released_at)) : new Date()
        });
        if (conn.tenantId) notifyAtlasAuxiliaryChange(conn.tenantId);
      }
    }

    const drafts = parseGitlabWebhookActivities(eventName, deliveryId, json);
    for (const draft of drafts) {
      await ingestGitActivity(conn, draft);
    }

    await recordWebhookReceipt(conn, eventName, null);
    if (drafts.length > 0 && conn.tenantId) notifyAtlasAuxiliaryChange(conn.tenantId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    await recordWebhookReceipt(conn, eventName, message);
    res.status(500).send("Processing error");
    return;
  }

  res.status(204).send();
}
