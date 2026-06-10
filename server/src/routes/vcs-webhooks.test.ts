import { createHmac, randomBytes } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { GitActivityKind, VcsProvider } from "@prisma/client";

const hoisted = vi.hoisted(() => ({
  repositoryConnectionFindUnique: vi.fn(),
  repositoryConnectionUpdate: vi.fn(),
  releaseCreate: vi.fn(),
  gitActivityUpsert: vi.fn(),
  gitActivityCreate: vi.fn(),
  featureUpdate: vi.fn(),
  requirementUpdate: vi.fn(),
  notifyAtlasAuxiliaryChange: vi.fn()
}));

vi.mock("../db.js", () => ({
  prismaUnscoped: {
    repositoryConnection: {
      findUnique: hoisted.repositoryConnectionFindUnique,
      update: hoisted.repositoryConnectionUpdate
    },
    release: { create: hoisted.releaseCreate },
    gitActivity: {
      upsert: hoisted.gitActivityUpsert,
      create: hoisted.gitActivityCreate
    },
    feature: { update: hoisted.featureUpdate },
    requirement: { update: hoisted.requirementUpdate }
  }
}));

vi.mock("../services/hubChangeHub.js", () => ({
  notifyAtlasAuxiliaryChange: hoisted.notifyAtlasAuxiliaryChange
}));

import { githubVcsWebhookHandler } from "./vcs-webhooks.js";

const connectionId = "conn-1";
let webhookSecret: string;

function sign(payload: Buffer): string {
  return `sha256=${createHmac("sha256", webhookSecret).update(payload).digest("hex")}`;
}

function makeRes(): Response & { statusCode: number; body?: string } {
  const res = {
    statusCode: 200,
    body: undefined as string | undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(msg?: string) {
      this.body = msg;
      return this;
    }
  };
  return res as Response & { statusCode: number; body?: string };
}

function makeReq(payload: Buffer, headers: Record<string, string>): Request {
  return {
    params: { connectionId },
    body: payload,
    header: (name: string) => headers[name.toLowerCase()]
  } as unknown as Request;
}

describe("githubVcsWebhookHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    webhookSecret = randomBytes(24).toString("hex");
    hoisted.repositoryConnectionFindUnique.mockResolvedValue({
      id: connectionId,
      tenantId: "tenant-1",
      provider: VcsProvider.GITHUB,
      webhookSecret
    });
    hoisted.repositoryConnectionUpdate.mockResolvedValue({});
    hoisted.gitActivityUpsert.mockResolvedValue({});
    hoisted.releaseCreate.mockResolvedValue({});
  });

  it("ingests pull_request without mutating backlog", async () => {
    const payload = Buffer.from(
      JSON.stringify({
        action: "opened",
        pull_request: {
          number: 9,
          title: "Atlas git observe",
          html_url: "https://github.com/o/r/pull/9",
          updated_at: "2026-05-17T12:00:00Z",
          user: { login: "dev" },
          head: { ref: "feat/git", sha: "abc" }
        }
      })
    );

    const res = makeRes();
    await githubVcsWebhookHandler(
      makeReq(payload, {
        "x-hub-signature-256": sign(payload),
        "x-github-event": "pull_request",
        "x-github-delivery": "delivery-9"
      }),
      res
    );

    expect(res.statusCode).toBe(204);
    expect(hoisted.gitActivityUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: GitActivityKind.PULL_REQUEST,
          prNumber: 9,
          deliveryId: "pr:delivery-9"
        })
      })
    );
    expect(hoisted.featureUpdate).not.toHaveBeenCalled();
    expect(hoisted.requirementUpdate).not.toHaveBeenCalled();
    expect(hoisted.repositoryConnectionUpdate).toHaveBeenCalled();
  });

  it("rejects bad signature", async () => {
    const payload = Buffer.from(JSON.stringify({ zen: "ping" }));
    const res = makeRes();
    await githubVcsWebhookHandler(
      makeReq(payload, {
        "x-hub-signature-256": "sha256=bad",
        "x-github-event": "ping"
      }),
      res
    );
    expect(res.statusCode).toBe(401);
    expect(hoisted.gitActivityUpsert).not.toHaveBeenCalled();
  });
});
