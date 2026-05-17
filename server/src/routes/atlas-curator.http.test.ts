import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";

const hoisted = vi.hoisted(() => ({
  runAtlasCurator: vi.fn(),
  logAudit: vi.fn()
}));

vi.mock("../atlasCurator/run.js", () => ({
  runAtlasCurator: hoisted.runAtlasCurator
}));

vi.mock("../services/audit.js", () => ({ logAudit: hoisted.logAudit }));

vi.mock("../tenant/tenantContext.js", () => ({
  getTenantContext: () => ({
    tenantId: "tenant-1",
    tenantSlug: "tymio",
    schemaName: "tenant_tymio",
    membershipRole: "OWNER"
  })
}));

import { atlasCuratorRouter } from "./atlas-curator.js";

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
    membershipRole: "OWNER"
  };
  next();
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use("/api/atlas-curator", atlasCuratorRouter);
  return app;
}

describe("atlasCuratorRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.runAtlasCurator.mockResolvedValue({
      agent: "atlas-curator",
      topicsProcessed: 1,
      topicsTruncated: false,
      created: 2,
      skipped: 0,
      proposalIds: ["p1", "p2"],
      topics: [],
      errors: []
    });
  });

  it("POST /run invokes curator and returns result", async () => {
    const res = await request(makeApp()).post("/api/atlas-curator/run").send({});
    expect(res.status).toBe(200);
    expect(res.body.result.created).toBe(2);
    expect(hoisted.runAtlasCurator).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      architectureTopicId: undefined
    });
  });

  it("POST /run scopes to architectureTopicId when provided", async () => {
    const res = await request(makeApp())
      .post("/api/atlas-curator/run")
      .send({ architectureTopicId: "topic-1" });
    expect(res.status).toBe(200);
    expect(hoisted.runAtlasCurator).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      architectureTopicId: "topic-1"
    });
  });

  it("POST /run returns 503 when LLM disabled", async () => {
    hoisted.runAtlasCurator.mockRejectedValueOnce(new Error("Atlas Curator LLM is disabled"));
    const res = await request(makeApp()).post("/api/atlas-curator/run").send({});
    expect(res.status).toBe(503);
  });
});
