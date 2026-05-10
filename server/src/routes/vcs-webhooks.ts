import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { ReleaseSource, VcsProvider } from "@prisma/client";
import { prismaUnscoped } from "../db.js";
import { notifyAtlasAuxiliaryChange } from "../services/hubChangeHub.js";

function verifyGithubSignature(secret: string, payload: Buffer, sigHeader: string | undefined): boolean {
  if (!sigHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const got = sigHeader.slice("sha256=".length);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(got, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Raw body parser route — `req.body` is Buffer */
export async function githubVcsWebhookHandler(req: Request, res: Response): Promise<void> {
  const connectionId = String(req.params.connectionId ?? "");
  const raw = req.body as Buffer;
  const sig = req.header("x-hub-signature-256");
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
    res.status(400).send("Invalid JSON");
    return;
  }
  const action = json.action as string | undefined;
  const release = json.release as Record<string, unknown> | undefined;
  if (release && (action === "published" || action === "released")) {
    const tag = String(release.tag_name ?? "");
    const htmlUrl = String(release.html_url ?? "");
    const name = String(release.name ?? tag);
    if (tag) {
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
      if (conn.tenantId) notifyAtlasAuxiliaryChange(conn.tenantId);
    }
  }
  res.status(204).send();
}

export async function gitlabVcsWebhookHandler(req: Request, res: Response): Promise<void> {
  const connectionId = String(req.params.connectionId ?? "");
  const token = req.header("x-gitlab-token");
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
    res.status(400).send("Invalid JSON");
    return;
  }
  const event = req.header("x-gitlab-event");
  if (event === "Release Hook" || event === "Release") {
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
      if (conn.tenantId) notifyAtlasAuxiliaryChange(conn.tenantId);
    }
  }
  res.status(204).send();
}
