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
  logAudit: vi.fn(),
  commitIntakeDrafts: vi.fn(),
  fetchUrlContent: vi.fn(),
  attachmentCreate: vi.fn(),
  attachmentUpdate: vi.fn(),
  attachmentDelete: vi.fn(),
  attachmentLinkCreate: vi.fn(),
  storagePut: vi.fn()
}));

vi.mock("../db.js", () => ({
  prisma: {
    product: { findFirst: hoisted.productFindFirst },
    intakeSession: {
      create: hoisted.intakeCreate,
      findFirst: hoisted.intakeFindFirst,
      update: hoisted.intakeUpdate
    },
    attachment: {
      create: hoisted.attachmentCreate,
      update: hoisted.attachmentUpdate,
      delete: hoisted.attachmentDelete
    },
    attachmentLink: {
      create: hoisted.attachmentLinkCreate
    }
  }
}));

vi.mock("../services/audit.js", () => ({
  logAudit: hoisted.logAudit
}));

vi.mock("../intake/commitDrafts.js", () => ({
  commitIntakeDrafts: hoisted.commitIntakeDrafts
}));

vi.mock("../intake/urlFetch.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../intake/urlFetch.js")>();
  return {
    ...mod,
    fetchUrlContent: hoisted.fetchUrlContent
  };
});

vi.mock("../attachments/storageFactory.js", () => ({
  getAttachmentStorage: () => ({
    put: hoisted.storagePut
  })
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

vi.mock("../intake/bugParser.js", () => ({
  parseBugDrafts: vi.fn(async () => ({
    source: "heuristic",
    drafts: {
      source: "heuristic",
      generatedAt: "2026-09-28T18:00:00.000Z",
      items: [
        {
          key: "bug-1",
          hubEntityType: "Feature",
          storyType: "BUG",
          approval: "pending",
          fieldProvenance: { title: "ai", severity: "ai", priority: "ai" },
          title: "Login clipped",
          description: "CTA clipped on rotate",
          stepsToReproduce: ["Open login", "Rotate"],
          expected: "Visible",
          actual: "Clipped",
          environment: "iOS",
          severity: "HIGH",
          priority: "P1",
          acceptanceCriteria: ["CTA visible after rotate"],
          affectedArea: "",
          parentKey: null,
          route: { initiativeId: null, featureId: null },
          requirements: []
        }
      ]
    }
  }))
}));

vi.mock("../intake/featureParser.js", () => ({
  parseFeatureDrafts: vi.fn(async () => ({
    source: "heuristic",
    drafts: {
      source: "heuristic",
      generatedAt: "2026-09-28T18:00:00.000Z",
      items: [
        {
          key: "feat-1",
          hubEntityType: "Feature",
          storyType: "FUNCTIONAL",
          approval: "pending",
          fieldProvenance: { title: "ai", priority: "ai" },
          title: "Better filters",
          problem: "Hard to find initiatives",
          solution: "Add filter chips",
          personas: ["PO"],
          businessValue: "Faster triage",
          priority: "P2",
          priorityRationale: "Common ask",
          missingInputs: [],
          acceptanceCriteria: ["Filter by label"],
          dependencies: [],
          risks: [],
          openQuestions: [],
          parentKey: null,
          route: { initiativeId: null, featureId: null },
          requirements: []
        }
      ]
    }
  }))
}));

import { intakeSessionsRouter } from "./intake-sessions.js";
import { planIntake } from "../intake/planner.js";
import { parseBugDrafts } from "../intake/bugParser.js";
import { parseFeatureDrafts } from "../intake/featureParser.js";

const mockPlanIntake = planIntake as ReturnType<typeof vi.fn>;
const mockParseBugDrafts = parseBugDrafts as ReturnType<typeof vi.fn>;
const mockParseFeatureDrafts = parseFeatureDrafts as ReturnType<typeof vi.fn>;

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

  const readyPlan = {
    planType: "SINGLE_BUG_FEATURE",
    rationale: "test",
    confidence: 0.7,
    items: [
      {
        key: "bug-1",
        hubEntityType: "Feature",
        title: "Login clipped",
        parentKey: null,
        storyType: "BUG",
        suggestedPriority: "P1",
        bugSeverity: "HIGH"
      }
    ]
  };

  it("POST drafts generates bug drafts when PLAN_READY", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.PLAN_READY,
      rawText: "Login clipped on rotate",
      creationPlan: readyPlan
    });
    hoisted.intakeUpdate
      .mockResolvedValueOnce({ ...baseSession, status: IntakeSessionStatus.DRAFTING })
      .mockResolvedValueOnce({
        ...baseSession,
        status: IntakeSessionStatus.REVIEWING,
        drafts: { items: [] }
      });

    const res = await request(makeApp()).post("/api/intake-sessions/s1/drafts").send({});
    expect(res.status).toBe(200);
    expect(res.body.drafts.items[0].storyType).toBe("BUG");
    expect(res.body.drafts.items[0].priority).toBe("P1");
    expect(res.body.session.status).toBe("REVIEWING");
    expect(mockParseBugDrafts).toHaveBeenCalled();
  });

  it("POST drafts generates feature drafts when FEATURE + PLAN_READY", async () => {
    const featurePlan = {
      planType: "SINGLE_FEATURE",
      rationale: "test",
      confidence: 0.7,
      items: [
        {
          key: "feat-1",
          hubEntityType: "Feature",
          title: "Better filters",
          parentKey: null,
          storyType: "FUNCTIONAL",
          suggestedPriority: "P2"
        }
      ]
    };
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      mode: IntakeMode.FEATURE,
      status: IntakeSessionStatus.PLAN_READY,
      rawText: "Better product filters for labels",
      creationPlan: featurePlan
    });
    hoisted.intakeUpdate
      .mockResolvedValueOnce({ ...baseSession, mode: IntakeMode.FEATURE, status: IntakeSessionStatus.DRAFTING })
      .mockResolvedValueOnce({
        ...baseSession,
        mode: IntakeMode.FEATURE,
        status: IntakeSessionStatus.REVIEWING,
        drafts: { items: [] }
      });

    const res = await request(makeApp()).post("/api/intake-sessions/s1/drafts").send({});
    expect(res.status).toBe(200);
    expect(res.body.drafts.items[0].priority).toBe("P2");
    expect(res.body.drafts.items[0].problem).toMatch(/initiatives/i);
    expect(res.body.session.status).toBe("REVIEWING");
    expect(mockParseFeatureDrafts).toHaveBeenCalled();
  });

  it("PATCH feature drafts/:key stamps provenance user", async () => {
    const draftItem = {
      key: "feat-1",
      hubEntityType: "Feature",
      storyType: "FUNCTIONAL",
      approval: "pending",
      fieldProvenance: { title: "ai", priority: "ai", problem: "ai" },
      title: "Better filters",
      problem: "Hard to find",
      solution: "",
      personas: [],
      businessValue: "",
      priority: "P2",
      priorityRationale: "",
      missingInputs: [],
      acceptanceCriteria: ["Filter by label"],
      dependencies: [],
      risks: [],
      openQuestions: [],
      parentKey: null,
      route: { initiativeId: null, featureId: null },
      requirements: []
    };
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      mode: IntakeMode.FEATURE,
      status: IntakeSessionStatus.REVIEWING,
      drafts: { items: [draftItem], source: "heuristic" }
    });
    hoisted.intakeUpdate.mockResolvedValueOnce({
      ...baseSession,
      mode: IntakeMode.FEATURE,
      status: IntakeSessionStatus.REVIEWING
    });

    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1/drafts/feat-1")
      .send({ draft: { priority: "DISCOVERY", problem: "Updated problem" } });

    expect(res.status).toBe(200);
    expect(res.body.draft.priority).toBe("DISCOVERY");
    expect(res.body.draft.problem).toBe("Updated problem");
    expect(res.body.draft.fieldProvenance.priority).toBe("user");
    expect(res.body.draft.fieldProvenance.problem).toBe("user");
  });

  it("POST drafts 409 without PLAN_READY", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.CAPTURING
    });
    const res = await request(makeApp()).post("/api/intake-sessions/s1/drafts").send({});
    expect(res.status).toBe(409);
  });

  it("PATCH drafts/:key marks provenance user and keeps priority override", async () => {
    const draftItem = {
      key: "bug-1",
      hubEntityType: "Feature",
      storyType: "BUG",
      approval: "pending",
      fieldProvenance: { severity: "ai", priority: "ai", title: "ai" },
      title: "Login clipped",
      description: "x",
      stepsToReproduce: [],
      expected: "",
      actual: "",
      environment: "",
      severity: "HIGH",
      priority: "P1",
      acceptanceCriteria: [],
      affectedArea: "",
      parentKey: null,
      route: { initiativeId: null, featureId: null },
      requirements: []
    };
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.REVIEWING,
      drafts: { items: [draftItem], source: "heuristic" }
    });
    hoisted.intakeUpdate.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.REVIEWING,
      drafts: { items: [draftItem] }
    });

    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1/drafts/bug-1")
      .send({ draft: { severity: "LOW", priority: "P0" } });

    expect(res.status).toBe(200);
    expect(res.body.draft.severity).toBe("LOW");
    expect(res.body.draft.priority).toBe("P0");
    expect(res.body.draft.fieldProvenance.priority).toBe("user");
    expect(res.body.draft.fieldProvenance.severity).toBe("user");
  });

  it("PATCH drafts/:key remaps priority when only severity changes and priority is AI", async () => {
    const draftItem = {
      key: "bug-1",
      hubEntityType: "Feature",
      storyType: "BUG",
      approval: "pending",
      fieldProvenance: { severity: "ai", priority: "ai", title: "ai" },
      title: "Login clipped",
      description: "x",
      stepsToReproduce: [],
      expected: "",
      actual: "",
      environment: "",
      severity: "HIGH",
      priority: "P1",
      acceptanceCriteria: [],
      affectedArea: "",
      parentKey: null,
      route: { initiativeId: null, featureId: null },
      requirements: []
    };
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.REVIEWING,
      drafts: { items: [draftItem], source: "heuristic" }
    });
    hoisted.intakeUpdate.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.REVIEWING
    });

    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1/drafts/bug-1")
      .send({ draft: { severity: "CRITICAL" } });

    expect(res.status).toBe(200);
    expect(res.body.draft.severity).toBe("CRITICAL");
    expect(res.body.draft.priority).toBe("P0");
    expect(res.body.draft.fieldProvenance.severity).toBe("user");
    expect(res.body.draft.fieldProvenance.priority).toBe("ai");
  });

  it("PATCH drafts/:key 404 for unknown draftKey", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.REVIEWING,
      drafts: {
        items: [
          {
            key: "bug-1",
            hubEntityType: "Feature",
            storyType: "BUG",
            approval: "pending",
            fieldProvenance: {},
            title: "x",
            description: "",
            stepsToReproduce: [],
            expected: "",
            actual: "",
            environment: "",
            severity: "MEDIUM",
            priority: "P2",
            acceptanceCriteria: [],
            affectedArea: "",
            requirements: []
          }
        ]
      }
    });
    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1/drafts/missing")
      .send({ draft: { title: "Nope" } });
    expect(res.status).toBe(404);
  });

  it("PATCH drafts/:key 409 when no drafts yet", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.PLAN_READY,
      drafts: null
    });
    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1/drafts/bug-1")
      .send({ draft: { title: "Nope" } });
    expect(res.status).toBe(409);
  });

  it("PATCH drafts/:key 409 when COMMITTED", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.COMMITTED,
      drafts: { items: [] }
    });
    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1/drafts/bug-1")
      .send({ draft: { title: "Nope" } });
    expect(res.status).toBe(409);
  });

  it("POST drafts 409 when COMMITTING", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.COMMITTING,
      creationPlan: readyPlan
    });
    const res = await request(makeApp()).post("/api/intake-sessions/s1/drafts").send({});
    expect(res.status).toBe(409);
  });

  it("POST commit creates hub rows when drafts approved", async () => {
    const drafts = {
      source: "heuristic",
      items: [
        {
          key: "bug-1",
          hubEntityType: "Feature",
          storyType: "BUG",
          approval: "approved",
          fieldProvenance: {},
          title: "Login clipped",
          description: "CTA",
          stepsToReproduce: [],
          expected: "",
          actual: "",
          environment: "",
          severity: "HIGH",
          priority: "P1",
          acceptanceCriteria: ["Visible"],
          affectedArea: "",
          route: { initiativeId: "init-1", featureId: null },
          requirements: []
        }
      ]
    };
    const created = {
      initiatives: [],
      features: [{ draftKey: "bug-1", id: "f1", title: "Login clipped", storyType: "BUG" }],
      requirements: [{ draftKey: "bug-1-ac-1", id: "r1", title: "Visible", featureId: "f1" }]
    };
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.REVIEWING,
      drafts
    });
    hoisted.intakeUpdate
      .mockResolvedValueOnce({ ...baseSession, status: IntakeSessionStatus.COMMITTING, drafts })
      .mockResolvedValueOnce({
        ...baseSession,
        status: IntakeSessionStatus.COMMITTED,
        drafts,
        committedAt: new Date("2026-09-28T20:00:00.000Z"),
        sourceMeta: { commitResult: created }
      });
    hoisted.commitIntakeDrafts.mockResolvedValueOnce({
      ok: true,
      result: created,
      createdNewInitiative: false
    });

    const res = await request(makeApp())
      .post("/api/intake-sessions/s1/commit")
      .send({ initiativeId: "init-1" });
    expect(res.status).toBe(200);
    expect(res.body.created.features[0].id).toBe("f1");
    expect(res.body.session.status).toBe("COMMITTED");
    expect(hoisted.commitIntakeDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ initiativeId: "init-1", sessionId: "s1" })
    );
  });

  it("POST commit 409 when pending drafts remain", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.REVIEWING,
      drafts: {
        items: [
          {
            key: "bug-1",
            hubEntityType: "Feature",
            storyType: "BUG",
            approval: "pending",
            fieldProvenance: {},
            title: "X",
            description: "",
            stepsToReproduce: [],
            expected: "",
            actual: "",
            environment: "",
            severity: "LOW",
            priority: "P3",
            acceptanceCriteria: [],
            affectedArea: "",
            requirements: []
          }
        ]
      }
    });
    hoisted.intakeUpdate.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.COMMITTING
    });
    hoisted.commitIntakeDrafts.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: "All drafts must be approved or skipped before create (1 still need review)"
    });
    hoisted.intakeUpdate.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.REVIEWING
    });

    const res = await request(makeApp()).post("/api/intake-sessions/s1/commit").send({ initiativeId: "i1" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/need review/i);
  });

  it("POST commit idempotent when already COMMITTED with commitResult", async () => {
    const created = {
      initiatives: [],
      features: [{ draftKey: "bug-1", id: "f1", title: "Login clipped", storyType: "BUG" }],
      requirements: []
    };
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.COMMITTED,
      sourceMeta: { commitResult: created },
      drafts: { items: [] }
    });
    const res = await request(makeApp()).post("/api/intake-sessions/s1/commit").send({});
    expect(res.status).toBe(200);
    expect(res.body.created.features[0].id).toBe("f1");
    expect(hoisted.commitIntakeDrafts).not.toHaveBeenCalled();
  });

  it("PATCH drafts approval to approved", async () => {
    const draftItem = {
      key: "bug-1",
      hubEntityType: "Feature",
      storyType: "BUG",
      approval: "pending",
      fieldProvenance: { title: "ai" },
      title: "Login clipped",
      description: "CTA",
      stepsToReproduce: [],
      expected: "",
      actual: "",
      environment: "",
      severity: "HIGH",
      priority: "P1",
      acceptanceCriteria: [],
      affectedArea: "",
      requirements: []
    };
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.REVIEWING,
      drafts: { items: [draftItem], source: "heuristic" }
    });
    hoisted.intakeUpdate.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.REVIEWING,
      drafts: { items: [{ ...draftItem, approval: "approved" }] }
    });
    const res = await request(makeApp())
      .patch("/api/intake-sessions/s1/drafts/bug-1")
      .send({ draft: { approval: "approved" } });
    expect(res.status).toBe(200);
    expect(res.body.draft.approval).toBe("approved");
  });

  it("POST fetch-url stores attachment and merges rawText on ok", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      rawText: "user note",
      sourceMeta: { channel: "ui_product", urlFetches: [] }
    });
    hoisted.fetchUrlContent.mockResolvedValueOnce({
      ok: true,
      provider: "generic",
      httpStatus: 200,
      contentType: "text/html",
      normalizedText: "Fetched page body",
      filename: "fetched-example.com-page.txt"
    });
    hoisted.attachmentCreate.mockResolvedValueOnce({
      id: "att-1",
      filename: "fetched-example.com-page.txt"
    });
    hoisted.storagePut.mockResolvedValueOnce(undefined);
    hoisted.attachmentUpdate.mockResolvedValueOnce({
      id: "att-1",
      filename: "fetched-example.com-page.txt",
      mimeType: "text/plain"
    });
    hoisted.attachmentLinkCreate.mockResolvedValueOnce({ id: "link-1" });
    hoisted.intakeUpdate.mockResolvedValueOnce({
      ...baseSession,
      rawText: "user note\n\n---\n\nSource: https://example.com/page\n\nFetched page body",
      sourceChannel: "url_fetch",
      sourceMeta: {
        channel: "url_fetch",
        urlFetches: [{ status: "ok", normalizedTextRef: "att-1" }]
      }
    });

    const res = await request(makeApp())
      .post("/api/intake-sessions/s1/fetch-url")
      .send({ url: "https://example.com/page" });

    expect(res.status).toBe(200);
    expect(res.body.urlFetch.status).toBe("ok");
    expect(res.body.urlFetch.normalizedTextRef).toBe("att-1");
    expect(res.body.attachment.id).toBe("att-1");
    expect(hoisted.storagePut).toHaveBeenCalled();
    expect(hoisted.attachmentLinkCreate).toHaveBeenCalled();
  });

  it("POST fetch-url records needs_auth without attachment", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      sourceMeta: { channel: "ui_product", urlFetches: [] }
    });
    hoisted.fetchUrlContent.mockResolvedValueOnce({
      ok: false,
      status: "needs_auth",
      provider: "notion",
      httpStatus: null,
      error: "This page needs sign-in"
    });
    hoisted.intakeUpdate.mockResolvedValueOnce({
      ...baseSession,
      sourceMeta: {
        channel: "ui_product",
        urlFetches: [{ status: "needs_auth", provider: "notion" }]
      }
    });

    const res = await request(makeApp())
      .post("/api/intake-sessions/s1/fetch-url")
      .send({ url: "https://www.notion.so/acme/page" });

    expect(res.status).toBe(200);
    expect(res.body.urlFetch.status).toBe("needs_auth");
    expect(hoisted.attachmentCreate).not.toHaveBeenCalled();
  });

  it("POST fetch-url 400 on empty url", async () => {
    const res = await request(makeApp()).post("/api/intake-sessions/s1/fetch-url").send({ url: "" });
    expect(res.status).toBe(400);
  });

  it("POST fetch-url 429 when rate limited", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example.com/${i}`,
      status: "ok",
      fetchedAt: new Date().toISOString()
    }));
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      sourceMeta: { channel: "ui_product", urlFetches: many }
    });
    const res = await request(makeApp())
      .post("/api/intake-sessions/s1/fetch-url")
      .send({ url: "https://example.com/more" });
    expect(res.status).toBe(429);
    expect(hoisted.fetchUrlContent).not.toHaveBeenCalled();
  });

  it("POST fetch-url 409 when session locked", async () => {
    hoisted.intakeFindFirst.mockResolvedValueOnce({
      ...baseSession,
      status: IntakeSessionStatus.COMMITTED
    });
    const res = await request(makeApp())
      .post("/api/intake-sessions/s1/fetch-url")
      .send({ url: "https://example.com/x" });
    expect(res.status).toBe(409);
  });
});
