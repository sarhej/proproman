import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole, VcsProvider } from "@prisma/client";

const hoisted = vi.hoisted(() => ({
  repositoryConnectionFindMany: vi.fn(),
  gitActivityFindMany: vi.fn()
}));

vi.mock("../db.js", () => ({
  prisma: {
    repositoryConnection: { findMany: hoisted.repositoryConnectionFindMany },
    gitActivity: { findMany: hoisted.gitActivityFindMany }
  }
}));

vi.mock("../env.js", () => ({
  env: { API_PUBLIC_URL: "https://api.example.com", PORT: 4000 }
}));

vi.mock("../tenant/tenantContext.js", () => ({
  getTenantContext: () => ({
    tenantId: "tenant-1",
    tenantSlug: "tymio",
    schemaName: "tenant_tymio",
    membershipRole: "MEMBER"
  })
}));

import { gitObserveRouter } from "./git-observe.js";

function authTenantMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
  (req as unknown as { user: { id: string; role: UserRole; isActive: boolean } }).user = {
    id: "u1",
    role: UserRole.ADMIN,
    isActive: true
  };
  (req as unknown as { tenantContext: object }).tenantContext = {
    tenantId: "tenant-1",
    tenantSlug: "tymio",
    schemaName: "tenant_tymio",
    membershipRole: "MEMBER"
  };
  next();
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(authTenantMiddleware);
  app.use("/api/git-observe", gitObserveRouter);
  return app;
}

describe("gitObserveRouter HTTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /health returns connection diagnostics", async () => {
    hoisted.repositoryConnectionFindMany.mockResolvedValueOnce([
      {
        id: "c1",
        provider: VcsProvider.GITHUB,
        owner: "org",
        repo: "app",
        displayName: "Main app",
        webhookSecret: "sec",
        oauthAccessToken: null,
        lastWebhookReceivedAt: new Date("2026-05-17T12:00:00Z"),
        lastWebhookEventType: "push",
        lastWebhookError: null,
        _count: { gitActivities: 3, releases: 1 }
      }
    ]);

    const res = await request(makeApp()).get("/api/git-observe/health");
    expect(res.status).toBe(200);
    expect(res.body.connections[0]).toMatchObject({
      owner: "org",
      repo: "app",
      webhookSecretConfigured: true,
      oauthConfigured: false,
      activityCount: 3,
      webhookUrl: "https://api.example.com/api/vcs/webhooks/github/c1"
    });
  });

  it("GET /activity lists recent git events", async () => {
    hoisted.gitActivityFindMany.mockResolvedValueOnce([
      {
        id: "a1",
        kind: "PUSH",
        action: "push",
        branch: "main",
        title: "feat",
        authorLogin: "dev",
        externalUrl: "https://github.com/o/r/commit/x",
        commitSha: "x",
        prNumber: null,
        occurredAt: new Date("2026-05-17T12:00:00Z"),
        repositoryConnection: {
          id: "c1",
          provider: VcsProvider.GITHUB,
          owner: "org",
          repo: "app",
          displayName: null
        }
      }
    ]);

    const res = await request(makeApp()).get("/api/git-observe/activity?limit=10");
    expect(res.status).toBe(200);
    expect(res.body.activities).toHaveLength(1);
    expect(res.body.activities[0].kind).toBe("PUSH");
  });
});
