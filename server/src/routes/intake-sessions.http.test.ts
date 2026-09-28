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

vi.mock("../intake/planner.js", () => ({
  planIntake: vi.fn(async ({ mode, rawText }: { mode: string; rawText: string }) => ({
    source: "heuristic",
    plan: {
      planType: mode === "BUG" ? "SINGLE_BUG_FEATURE" : "SINGLE_FEATURE",
      rationale: "test plan",
      confidence: rawText.trim() ? 0.7 : 0.3,
      needsClarification: !rawText.trim() || rawText.length < 20,
      clarificationQuestions: rawText.length < 20 ? [{ id: "persona", prompt: "Who?" }] : undefined,
      items: [
        {
          key: mode === "BUG" ? "bug-1" : "feat-1",
          hubEntityType: "Feature",
          title: rawText.trim().slice(0, 40) || "Untitled",
          parentKey: null,
          storyType: mode === "BUG" ? "BUG" : "FUNCTIONAL",
          suggestedPriority: "P2",
          bugSeverity: mode === "BUG" ? "MEDIUM" : null
        }
      ]
    }
  }))
}));

import { intakeSessionsRouter } from "./intake-sessions.js";
import { planIntake } from "../intake/planner.js";

const mockPlanIntake = planIntake as ReturnType<typeof vi.fn>;

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
  clarification: null as object | null,
  creationPlan: null as object | null,
  drafts: null,
  analyzeError: null as string | null,
  confidence: null as number | null,
  createdById: "u1",
  committedAt: null as Date | null,
  createdAt: new Date("2026-09-07T12:00:00.000Z"),
  updatedAt: new Date("2026-09-07T12:00:00.000Z"),
  product: { name: "App" }
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
  });

  it("POST 403 for VIEWER membership", async () => {
    const res = await request(makeApp(MembershipRole.VIEWER))
      .post("/api/intake-sessions")
      .send({ productId: "p1", mode: "BUG" });
    expect(res.status).toBe(403);
  });

  it("GET returns session", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce(baseSession);
    const res = await request(makeApp()).get("/api/intake-sessions/s1");
    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe("s1");
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

  it("PATCH 409 when COMMITTED", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.COMMITTED
    });
    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1")
      .send({ rawText: "nope" });
    expect(res.status).toBe(409);
  });

  it("POST analyze returns creationPlan and PLAN_READY", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      rawText: "Login CTA is clipped on iPhone SE after rotate with long labels."
    });
    hoisted.intakeUpdate
      .mockResolvedValueOnce({ ...baseSession, status: IntakeSessionStatus.ANALYZING })
      .mockResolvedValueOnce({
        ...baseSession,
        status: IntakeSessionStatus.PLAN_READY,
        confidence: 0.7,
        creationPlan: { planType: "SINGLE_BUG_FEATURE" }
      });

    const res = await request(makeApp()).post("/api/intake-sessions/s1/analyze").send({});

    expect(res.status).toBe(200);
    expect(res.body.analyze.stub).toBe(false);
    expect(res.body.analyze.creationPlan).toBeTruthy();
    expect(res.body.analyze.creationPlan.items[0].storyType).toBe("BUG");
    expect(res.body.session.status).toBe("PLAN_READY");
    expect(mockPlanIntake).toHaveBeenCalled();
  });

  it("POST analyze sets CLARIFYING when plan needs clarification", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      mode: IntakeMode.FEATURE,
      rawText: "fix"
    });
    hoisted.intakeUpdate
      .mockResolvedValueOnce({ ...baseSession, status: IntakeSessionStatus.ANALYZING })
      .mockResolvedValueOnce({
        ...baseSession,
        status: IntakeSessionStatus.CLARIFYING
      });

    const res = await request(makeApp()).post("/api/intake-sessions/s1/analyze").send({});
    expect(res.status).toBe(200);
    expect(res.body.analyze.needsClarification).toBe(true);
    expect(res.body.session.status).toBe("CLARIFYING");
  });

  it("POST clarify merges answers and re-plans", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      mode: IntakeMode.FEATURE,
      rawText: "Improve intake UX for product owners creating bugs",
      clarification: { persona: "old" }
    });
    hoisted.intakeUpdate.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.PLAN_READY,
      clarification: { persona: "old", outcome: "shipped" }
    });

    const res = await request(makeApp())
      .post("/api/intake-sessions/s1/clarify")
      .send({ answers: { outcome: "shipped" } });

    expect(res.status).toBe(200);
    expect(mockPlanIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        clarificationAnswers: { persona: "old", outcome: "shipped" }
      })
    );
  });

  it("PATCH plan validates and saves user edits", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce(baseSession);
    const plan = {
      planType: "SINGLE_BUG_FEATURE",
      rationale: "user edited",
      confidence: 0.9,
      items: [
        {
          key: "bug-1",
          hubEntityType: "Feature",
          title: "Edited title",
          parentKey: null,
          storyType: "BUG",
          suggestedPriority: "P1",
          bugSeverity: "HIGH"
        }
      ]
    };
    hoisted.intakeUpdate.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.PLAN_READY,
      creationPlan: plan
    });

    const res = await request(makeApp()).patch("/api/intake-sessions/s1/plan").send({ creationPlan: plan });
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe("PLAN_READY");
  });

  it("PATCH plan 400 for invalid schema", async () => {
    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1/plan")
      .send({ creationPlan: { planType: "NOPE", rationale: "", confidence: 2, items: [] } });
    expect(res.status).toBe(400);
  });

  it("POST analyze 409 when COMMITTING", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.COMMITTING
    });
    const res = await request(makeApp()).post("/api/intake-sessions/s1/analyze").send({});
    expect(res.status).toBe(409);
  });
});
