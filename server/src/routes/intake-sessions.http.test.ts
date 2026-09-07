import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { IntakeMode, IntakeSessionStatus, UserRole } from "@prisma/client";

const hoisted = vi.hoisted(() => ({
  productFindFirst: vi.fn(),
  intakeCreate: vi.fn(),
  intakeFindFirst: vi.fn(),
  intakeUpdate: vi.fn(),
  logAudit: vi.fn()
}));

vi.mock("../db.js", () => ({
  prisma: {
    product: { findFirst: hoisted.productFindFirst },
    intakeSession: {
      create: hoisted.intakeCreate,
      findFirst: hoisted.intakeFindFirst,
      update: hoisted.intakeUpdate
    }
  }
}));

vi.mock("../services/audit.js", () => ({
  logAudit: hoisted.logAudit
}));

vi.mock("../tenant/tenantContext.js", () => ({
  getTenantContext: () => ({
    tenantId: "tenant-1",
    tenantSlug: "acme",
    schemaName: "tenant_acme",
    membershipRole: "MEMBER"
  })
}));

import { intakeSessionsRouter } from "./intake-sessions.js";

function authTenantMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
  (req as unknown as { user: { id: string; role: UserRole; isActive: boolean } }).user = {
    id: "u1",
    role: UserRole.EDITOR,
    isActive: true
  };
  (req as unknown as { tenantContext: object }).tenantContext = {
    tenantId: "tenant-1",
    tenantSlug: "acme",
    schemaName: "tenant_acme",
    membershipRole: "MEMBER"
  };
  next();
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(authTenantMiddleware);
  app.use("/api/intake-sessions", intakeSessionsRouter);
  return app;
}

const baseSession = {
  id: "s1",
  tenantId: "tenant-1",
  productId: "p1",
  mode: IntakeMode.BUG,
  status: IntakeSessionStatus.CAPTURING,
  rawText: "",
  rawExcerptHash: null,
  sourceChannel: "ui_product",
  sourceMeta: { channel: "ui_product" },
  clarification: null,
  creationPlan: null,
  drafts: null,
  analyzeError: null,
  confidence: null,
  createdById: "u1",
  committedAt: null,
  createdAt: new Date("2026-09-07T12:00:00.000Z"),
  updatedAt: new Date("2026-09-07T12:00:00.000Z")
};

describe("intakeSessionsRouter HTTP (mocked prisma)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST creates intake session for product in tenant", async () => {
    hoisted.productFindFirst.mockResolvedValueOnce({ id: "p1" });
    hoisted.intakeCreate.mockResolvedValueOnce({ ...baseSession, mode: IntakeMode.FEATURE });

    const res = await request(makeApp())
      .post("/api/intake-sessions")
      .send({ productId: "p1", mode: "FEATURE" });

    expect(res.status).toBe(201);
    expect(res.body.session.mode).toBe("FEATURE");
    expect(hoisted.productFindFirst).toHaveBeenCalledWith({
      where: { id: "p1", tenantId: "tenant-1" },
      select: { id: true }
    });
    expect(hoisted.logAudit).toHaveBeenCalled();
  });

  it("POST 404 when product missing", async () => {
    hoisted.productFindFirst.mockResolvedValueOnce(null);
    const res = await request(makeApp())
      .post("/api/intake-sessions")
      .send({ productId: "missing", mode: "BUG" });
    expect(res.status).toBe(404);
  });

  it("PATCH updates rawText and hash", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce(baseSession);
    hoisted.intakeUpdate.mockResolvedValueOnce({
      ...baseSession,
      rawText: "clipped CTA",
      rawExcerptHash: "abc"
    });

    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1")
      .send({ rawText: "clipped CTA" });

    expect(res.status).toBe(200);
    expect(hoisted.intakeUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({
        rawText: "clipped CTA",
        rawExcerptHash: expect.any(String)
      })
    });
  });

  it("POST analyze returns stub without creationPlan", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      rawText: "bug description"
    });
    hoisted.intakeUpdate.mockResolvedValueOnce({
      ...baseSession,
      rawText: "bug description",
      sourceMeta: { analyzeStub: true }
    });

    const res = await request(makeApp()).post("/api/intake-sessions/s1/analyze").send({});

    expect(res.status).toBe(200);
    expect(res.body.analyze.stub).toBe(true);
    expect(res.body.analyze.creationPlan).toBeNull();
    expect(res.body.session.status).toBe("CAPTURING");
  });
});
