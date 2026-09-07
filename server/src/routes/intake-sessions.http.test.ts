import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { IntakeMode, IntakeSessionStatus, MembershipRole, UserRole } from "@prisma/client";
import { createHash } from "node:crypto";

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

function authTenantMiddleware(
  membershipRole: MembershipRole,
  role: UserRole = UserRole.EDITOR
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: { id: string; role: UserRole; isActive: boolean } }).user = {
      id: "u1",
      role,
      isActive: true
    };
    (req as unknown as { tenantContext: object }).tenantContext = {
      tenantId: "tenant-1",
      tenantSlug: "acme",
      schemaName: "tenant_acme",
      membershipRole
    };
    next();
  };
}

function makeApp(membershipRole: MembershipRole = MembershipRole.MEMBER, role?: UserRole) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(authTenantMiddleware(membershipRole, role));
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
  rawExcerptHash: null as string | null,
  sourceChannel: "ui_product",
  sourceMeta: { channel: "ui_product" } as object,
  clarification: null,
  creationPlan: null,
  drafts: null,
  analyzeError: null as string | null,
  confidence: null as number | null,
  createdById: "u1",
  committedAt: null as Date | null,
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

  it("POST 400 for invalid mode", async () => {
    const res = await request(makeApp())
      .post("/api/intake-sessions")
      .send({ productId: "p1", mode: "EPIC" });
    expect(res.status).toBe(400);
    expect(hoisted.intakeCreate).not.toHaveBeenCalled();
  });

  it("POST 400 when productId missing", async () => {
    const res = await request(makeApp()).post("/api/intake-sessions").send({ mode: "BUG" });
    expect(res.status).toBe(400);
  });

  it("POST 403 for VIEWER membership", async () => {
    const res = await request(makeApp(MembershipRole.VIEWER))
      .post("/api/intake-sessions")
      .send({ productId: "p1", mode: "BUG" });
    expect(res.status).toBe(403);
    expect(hoisted.productFindFirst).not.toHaveBeenCalled();
  });

  it("GET returns session", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce(baseSession);
    const res = await request(makeApp()).get("/api/intake-sessions/s1");
    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe("s1");
  });

  it("GET 404 when missing", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce(null);
    const res = await request(makeApp()).get("/api/intake-sessions/nope");
    expect(res.status).toBe(404);
  });

  it("GET allows VIEWER (read)", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce(baseSession);
    const res = await request(makeApp(MembershipRole.VIEWER)).get("/api/intake-sessions/s1");
    expect(res.status).toBe(200);
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
    const expectedHash = createHash("sha256").update("clipped CTA".normalize("NFKC").trim()).digest("hex");
    expect(hoisted.intakeUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({
        rawText: "clipped CTA",
        rawExcerptHash: expectedHash
      })
    });
  });

  it("PATCH normalizes unicode when hashing", async () => {
    const raw = "café"; // composed
    hoisted.intakeFindFirst.mockResolvedValueOnce(baseSession);
    hoisted.intakeUpdate.mockResolvedValueOnce({ ...baseSession, rawText: raw });

    await request(makeApp()).patch("/api/intake-sessions/s1").send({ rawText: raw });

    const expectedHash = createHash("sha256").update(raw.normalize("NFKC").trim()).digest("hex");
    expect(hoisted.intakeUpdate.mock.calls[0][0].data.rawExcerptHash).toBe(expectedHash);
  });

  it("PATCH 400 when rawText exceeds max", async () => {
    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1")
      .send({ rawText: "x".repeat(100_001) });
    expect(res.status).toBe(400);
    expect(hoisted.intakeFindFirst).not.toHaveBeenCalled();
  });

  it("PATCH 400 for illegal status transition to PLAN_READY", async () => {
    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1")
      .send({ status: "PLAN_READY" });
    expect(res.status).toBe(400);
  });

  it("PATCH can abandon session", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce(baseSession);
    hoisted.intakeUpdate.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.ABANDONED
    });
    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1")
      .send({ status: "ABANDONED" });
    expect(res.status).toBe(200);
    expect(hoisted.intakeUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { status: "ABANDONED" }
    });
  });

  it("PATCH 409 when COMMITTED", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.COMMITTED
    });
    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1")
      .send({ rawText: "nope" });
    expect(res.status).toBe(409);
    expect(hoisted.intakeUpdate).not.toHaveBeenCalled();
  });

  it("PATCH 409 when COMMITTING", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.COMMITTING
    });
    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1")
      .send({ rawText: "nope" });
    expect(res.status).toBe(409);
  });

  it("PATCH 404 when missing", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce(null);
    const res = await request(makeApp())
      .patch("/api/intake-sessions/missing")
      .send({ rawText: "x" });
    expect(res.status).toBe(404);
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
    expect(res.body.analyze.needsClarification).toBe(false);
    expect(res.body.session.status).toBe("CAPTURING");
    expect(res.body.analyze.message).toMatch(/stub/i);
  });

  it("POST analyze empty rawText returns prompt message", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({ ...baseSession, rawText: "   " });
    hoisted.intakeUpdate.mockResolvedValueOnce({ ...baseSession, rawText: "   " });

    const res = await request(makeApp()).post("/api/intake-sessions/s1/analyze").send({});

    expect(res.status).toBe(200);
    expect(res.body.analyze.message).toMatch(/Add text or attachments/i);
    expect(hoisted.intakeUpdate.mock.calls[0][0].data.sourceMeta.hadRawText).toBe(false);
  });

  it("POST analyze 409 when COMMITTED", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.COMMITTED
    });
    const res = await request(makeApp()).post("/api/intake-sessions/s1/analyze").send({});
    expect(res.status).toBe(409);
    expect(hoisted.intakeUpdate).not.toHaveBeenCalled();
  });

  it("POST analyze 409 when COMMITTING", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.COMMITTING
    });
    const res = await request(makeApp()).post("/api/intake-sessions/s1/analyze").send({});
    expect(res.status).toBe(409);
  });

  it("POST analyze 404 when missing", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce(null);
    const res = await request(makeApp()).post("/api/intake-sessions/nope/analyze").send({});
    expect(res.status).toBe(404);
  });

  it("POST analyze 403 for VIEWER", async () => {
    const res = await request(makeApp(MembershipRole.VIEWER))
      .post("/api/intake-sessions/s1/analyze")
      .send({});
    expect(res.status).toBe(403);
  });

  it("analyze clears prior creationPlan (DbNull) and never invents hub entities", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      rawText: "x",
      creationPlan: { planType: "SINGLE_FEATURE", items: [] }
    });
    hoisted.intakeUpdate.mockResolvedValueOnce({ ...baseSession, rawText: "x" });

    await request(makeApp()).post("/api/intake-sessions/s1/analyze").send({});

    const data = hoisted.intakeUpdate.mock.calls[0][0].data;
    expect(data.creationPlan).toBeDefined();
    expect(data.status).toBe(IntakeSessionStatus.CAPTURING);
    expect(data.confidence).toBeNull();
  });
});
