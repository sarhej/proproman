import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { AtlasCuratorProposalStatus, AtlasCuratorProposalType, UserRole } from "@prisma/client";

const hoisted = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  architectureTopicFindUnique: vi.fn(),
  logAudit: vi.fn(),
  notifyAtlasAuxiliaryChange: vi.fn()
}));

vi.mock("../db.js", () => ({
  prisma: {
    atlasCuratorProposal: {
      findMany: hoisted.findMany,
      findUnique: hoisted.findUnique,
      create: hoisted.create,
      update: hoisted.update
    },
    architectureTopic: { findUnique: hoisted.architectureTopicFindUnique },
    $transaction: hoisted.transaction
  }
}));

vi.mock("../services/audit.js", () => ({ logAudit: hoisted.logAudit }));
vi.mock("../services/hubChangeHub.js", () => ({
  notifyAtlasAuxiliaryChange: hoisted.notifyAtlasAuxiliaryChange
}));

vi.mock("../tenant/tenantContext.js", () => ({
  getTenantContext: () => ({
    tenantId: "tenant-1",
    tenantSlug: "tymio",
    schemaName: "tenant_tymio",
    membershipRole: "OWNER"
  })
}));

import { atlasProposalsRouter } from "./atlas-proposals.js";

function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
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
    membershipRole: "OWNER"
  };
  next();
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use("/api/atlas-proposals", atlasProposalsRouter);
  return app;
}

describe("atlasProposalsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        atlasCuratorProposal: {
          findUnique: hoisted.findUnique,
          update: hoisted.update
        },
        architectureTopic: {
          findUnique: async () => ({
            id: "topic-1",
            lockedFields: null,
            asIsSummary: "old",
            toBeSummary: null,
            title: "T",
            synonyms: null,
            docPaths: null
          }),
          update: vi.fn()
        },
        architectureTopicInitiative: { upsert: vi.fn(), deleteMany: vi.fn() },
        architectureTopicCapability: { upsert: vi.fn(), deleteMany: vi.fn() }
      };
      return fn(tx);
    });
  });

  it("GET / lists proposals", async () => {
    hoisted.findMany.mockResolvedValueOnce([
      {
        id: "p1",
        proposalType: AtlasCuratorProposalType.TOPIC_LAYER_PATCH,
        status: AtlasCuratorProposalStatus.PENDING
      }
    ]);
    const res = await request(makeApp()).get("/api/atlas-proposals?status=PENDING");
    expect(res.status).toBe(200);
    expect(res.body.proposals).toHaveLength(1);
  });

  it("POST / rejects proposal for locked field at intake", async () => {
    hoisted.architectureTopicFindUnique.mockResolvedValueOnce({
      id: "topic-1",
      lockedFields: ["asIsSummary"]
    });
    const res = await request(makeApp())
      .post("/api/atlas-proposals")
      .send({
        proposalType: "TOPIC_LAYER_PATCH",
        architectureTopicId: "topic-1",
        fieldPath: "asIsSummary",
        proposedValue: { field: "asIsSummary", value: "new" },
        sources: [{ kind: "doc", ref: "docs/HUB.md" }],
        createdByAgent: "atlas-curator"
      });
    expect(res.status).toBe(409);
  });

  it("POST /:id/accept applies pending proposal", async () => {
    hoisted.findUnique
      .mockResolvedValueOnce({
        id: "p1",
        status: AtlasCuratorProposalStatus.PENDING,
        proposalType: AtlasCuratorProposalType.TOPIC_LAYER_PATCH,
        architectureTopicId: "topic-1",
        proposedValue: { field: "asIsSummary", value: "new text" }
      })
      .mockResolvedValueOnce({
        id: "p1",
        status: AtlasCuratorProposalStatus.ACCEPTED,
        architectureTopic: { id: "topic-1", slug: "x", title: "X", lockedFields: null }
      });
    const res = await request(makeApp()).post("/api/atlas-proposals/p1/accept").send({});
    expect(res.status).toBe(200);
    expect(hoisted.notifyAtlasAuxiliaryChange).toHaveBeenCalledWith("tenant-1");
  });
});
