import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";
import {
  markAtlasCompileFailed,
  markAtlasCompileStarted,
  markAtlasCompileSucceeded,
  markAtlasRebuildPending,
  resetAtlasRebuildStateForTests
} from "../workspaceAtlas/rebuildState.js";

const hoisted = vi.hoisted(() => ({
  readWorkspaceAtlas: vi.fn(),
  readObjectShard: vi.fn()
}));

vi.mock("../workspaceAtlas/store.js", () => ({
  readWorkspaceAtlas: hoisted.readWorkspaceAtlas,
  readObjectShard: hoisted.readObjectShard
}));

vi.mock("../tenant/tenantContext.js", () => ({
  getTenantContext: () => ({
    tenantId: "tenant-1",
    tenantSlug: "tymio",
    schemaName: "tenant_tymio",
    membershipRole: "MEMBER"
  })
}));

import { workspaceAtlasRouter } from "./workspace-atlas.js";

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
  app.use("/api/workspace-atlas", workspaceAtlasRouter);
  return app;
}

function atlasFixture(overrides: Partial<typeof sampleAtlas> = {}) {
  return { ...sampleAtlas, ...overrides };
}

const sampleAtlas = {
  schemaVersion: "1" as const,
  tenantId: "tenant-1",
  workspaceSlug: "tymio",
  materializedAt: "2026-05-17T10:00:00.000Z",
  sourceMaxUpdatedAt: "2026-05-17T11:00:00.000Z",
  domains: [],
  products: [],
  initiativeIndex: [],
  featureIndex: [],
  requirementIndex: [],
  objectCounts: {
    domain: 0,
    product: 0,
    initiative: 0,
    feature: 0,
    requirement: 0
  },
  capabilityOntology: { kind: "pointer" as const, note: "n" },
  backlogOntology: { kind: "reference" as const, spine: "s" }
};

describe("workspaceAtlasRouter HTTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAtlasRebuildStateForTests();
  });

  afterEach(() => {
    resetAtlasRebuildStateForTests();
  });

  it("GET / returns compiled false when atlas missing", async () => {
    hoisted.readWorkspaceAtlas.mockResolvedValueOnce(null);
    const res = await request(makeApp()).get("/api/workspace-atlas");
    expect(res.status).toBe(200);
    expect(res.body.atlas).toBeNull();
    expect(res.body.compiled).toBe(false);
    expect(res.body.freshness).toBeNull();
    expect(res.body.health).toMatchObject({
      status: "incomplete",
      pendingRebuild: false,
      compiling: false,
      lastRebuildAt: null,
      lastErrorMessage: null
    });
  });

  it("GET / returns incomplete even when rebuild is pending", async () => {
    markAtlasRebuildPending("tenant-1");
    hoisted.readWorkspaceAtlas.mockResolvedValueOnce(null);
    const res = await request(makeApp()).get("/api/workspace-atlas");
    expect(res.body.health).toMatchObject({
      status: "incomplete",
      pendingRebuild: true
    });
  });

  it("GET / returns stale when source is newer than materialization", async () => {
    hoisted.readWorkspaceAtlas.mockResolvedValueOnce(sampleAtlas);
    const res = await request(makeApp()).get("/api/workspace-atlas");
    expect(res.status).toBe(200);
    expect(res.body.compiled).toBe(true);
    expect(res.body.freshness.isStale).toBe(true);
    expect(res.body.freshness.workspaceSlug).toBe("tymio");
    expect(res.body.freshness.ageMinutes).toBeTypeOf("number");
    expect(res.body.health.status).toBe("stale");
  });

  it("GET / returns current when timestamps are equal (not stale)", async () => {
    const ts = "2026-09-07T12:00:00.000Z";
    hoisted.readWorkspaceAtlas.mockResolvedValueOnce(
      atlasFixture({ materializedAt: ts, sourceMaxUpdatedAt: ts })
    );
    markAtlasCompileSucceeded("tenant-1");
    const res = await request(makeApp()).get("/api/workspace-atlas");
    expect(res.body.freshness.isStale).toBe(false);
    expect(res.body.health.status).toBe("current");
    expect(res.body.health.lastRebuildAt).toBeTruthy();
  });

  it("GET / returns current when materialization is newer than source", async () => {
    hoisted.readWorkspaceAtlas.mockResolvedValueOnce(
      atlasFixture({
        materializedAt: "2026-09-07T14:00:00.000Z",
        sourceMaxUpdatedAt: "2026-09-07T13:00:00.000Z"
      })
    );
    const res = await request(makeApp()).get("/api/workspace-atlas");
    expect(res.body.freshness.isStale).toBe(false);
    expect(res.body.health.status).toBe("current");
  });

  it("GET / returns rebuilding when pending debounce", async () => {
    markAtlasRebuildPending("tenant-1");
    hoisted.readWorkspaceAtlas.mockResolvedValueOnce(
      atlasFixture({
        materializedAt: "2026-09-07T14:00:00.000Z",
        sourceMaxUpdatedAt: "2026-09-07T14:00:00.000Z"
      })
    );
    const res = await request(makeApp()).get("/api/workspace-atlas");
    expect(res.body.health).toMatchObject({
      status: "rebuilding",
      pendingRebuild: true,
      compiling: false
    });
  });

  it("GET / returns rebuilding when compile in flight", async () => {
    markAtlasCompileStarted("tenant-1");
    hoisted.readWorkspaceAtlas.mockResolvedValueOnce(
      atlasFixture({
        materializedAt: "2026-09-07T14:00:00.000Z",
        sourceMaxUpdatedAt: "2026-09-07T14:00:00.000Z"
      })
    );
    const res = await request(makeApp()).get("/api/workspace-atlas");
    expect(res.body.health).toMatchObject({
      status: "rebuilding",
      pendingRebuild: false,
      compiling: true
    });
  });

  it("GET / returns error after failed compile (idle)", async () => {
    markAtlasCompileFailed("tenant-1", "EACCES write atlas");
    hoisted.readWorkspaceAtlas.mockResolvedValueOnce(
      atlasFixture({
        materializedAt: "2026-09-07T14:00:00.000Z",
        sourceMaxUpdatedAt: "2026-09-07T14:00:00.000Z"
      })
    );
    const res = await request(makeApp()).get("/api/workspace-atlas");
    expect(res.body.health).toMatchObject({
      status: "error",
      lastErrorMessage: "EACCES write atlas",
      compiling: false
    });
  });

  it("GET / prefers rebuilding over stale when pending", async () => {
    markAtlasRebuildPending("tenant-1");
    hoisted.readWorkspaceAtlas.mockResolvedValueOnce(sampleAtlas);
    const res = await request(makeApp()).get("/api/workspace-atlas");
    expect(res.body.freshness.isStale).toBe(true);
    expect(res.body.health.status).toBe("rebuilding");
  });

  it("GET /objects/:type/:id returns shard", async () => {
    hoisted.readObjectShard.mockResolvedValueOnce({
      schemaVersion: "1",
      objectType: "ARCHITECTURE_TOPIC",
      id: "topic-1",
      tenantId: "tenant-1",
      workspaceSlug: "tymio",
      facts: { title: "Multitenancy" },
      graph: { links: {}, edges: [] },
      provenance: {
        sourceUpdatedAt: "2026-05-17T10:00:00.000Z",
        materializedAt: "2026-05-17T10:00:00.000Z",
        derivation: "hub-api"
      }
    });
    const res = await request(makeApp()).get("/api/workspace-atlas/objects/ARCHITECTURE_TOPIC/topic-1");
    expect(res.status).toBe(200);
    expect(res.body.shard.facts.title).toBe("Multitenancy");
  });

  it("GET /objects rejects invalid object type", async () => {
    const res = await request(makeApp()).get("/api/workspace-atlas/objects/INVALID/topic-1");
    expect(res.status).toBe(400);
  });

  it("GET /objects returns 404 when shard missing", async () => {
    hoisted.readObjectShard.mockResolvedValueOnce(null);
    const res = await request(makeApp()).get("/api/workspace-atlas/objects/INITIATIVE/missing");
    expect(res.status).toBe(404);
  });
});
