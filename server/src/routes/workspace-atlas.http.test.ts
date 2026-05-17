import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";

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
  });

  it("GET / returns compiled false when atlas missing", async () => {
    hoisted.readWorkspaceAtlas.mockResolvedValueOnce(null);
    const res = await request(makeApp()).get("/api/workspace-atlas");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ atlas: null, compiled: false, freshness: null });
  });

  it("GET / returns atlas with freshness metadata", async () => {
    hoisted.readWorkspaceAtlas.mockResolvedValueOnce(sampleAtlas);
    const res = await request(makeApp()).get("/api/workspace-atlas");
    expect(res.status).toBe(200);
    expect(res.body.compiled).toBe(true);
    expect(res.body.freshness.isStale).toBe(true);
    expect(res.body.freshness.workspaceSlug).toBe("tymio");
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
