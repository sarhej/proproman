import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole, Priority, Horizon, InitiativeStatus, CommercialType } from "@prisma/client";
import { initiativesRouter } from "./initiatives.js";
import type { TenantContext } from "../tenant/tenantContext.js";

vi.mock("../db.js", () => ({
  prisma: {
    initiative: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    initiativePersonaImpact: { deleteMany: vi.fn(), createMany: vi.fn() },
    initiativeRevenueStream: { deleteMany: vi.fn(), createMany: vi.fn() },
    demandLink: { deleteMany: vi.fn(), createMany: vi.fn() },
    initiativeAssignment: { deleteMany: vi.fn(), createMany: vi.fn() },
    tenantMembership: { findMany: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  },
}));

vi.mock("../services/audit.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../db.js";

function stubTenant(membershipRole: TenantContext["membershipRole"]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { tenantContext: TenantContext }).tenantContext = {
      tenantId: "t-test",
      tenantSlug: "test",
      schemaName: "tenant_test",
      membershipRole,
    };
    next();
  };
}

const mockTenantMembership = prisma.tenantMembership as unknown as { findMany: ReturnType<typeof vi.fn> };

const mockInitiative = prisma.initiative as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

function authEditor() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: "ed1",
      email: "ed@test.local",
      name: "Ed",
      role: UserRole.EDITOR,
      isActive: true,
      activeTenantId: null,
    } as Express.User;
    next();
  };
}

function authAdmin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: "ad1",
      email: "ad@test.local",
      name: "Ad",
      role: UserRole.ADMIN,
      isActive: true,
      activeTenantId: null,
    } as Express.User;
    next();
  };
}

const minimalIncludePayload = {
  product: null,
  domain: { id: "d1", name: "D", color: "#000", sortOrder: 0 },
  owner: null,
  personaImpacts: [],
  revenueWeights: [],
  features: [],
  decisions: [],
  risks: [],
  assignments: [],
  demandLinks: [],
  outgoingDeps: [],
  incomingDeps: [],
  milestones: [],
  kpis: [],
  stakeholders: [],
  successCriteriaItems: [],
};

describe("initiatives isEpic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantMembership.findMany.mockImplementation(async (args: { where: { userId: { in: string[] } } }) =>
      args.where.userId.in.map((userId: string) => ({ userId }))
    );
  });

  it("GET passes isEpic: true into findMany when query isEpic=true", async () => {
    const app = express();
    app.use(express.json());
    app.use(authEditor());
    app.use(stubTenant("MEMBER"));
    app.use("/api/initiatives", initiativesRouter);
    mockInitiative.findMany.mockResolvedValue([]);

    await request(app).get("/api/initiatives?isEpic=true");

    expect(mockInitiative.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isEpic: true }),
      })
    );
  });

  it("POST sets isEpic from body", async () => {
    const app = express();
    app.use(express.json());
    app.use(authEditor());
    app.use(stubTenant("MEMBER"));
    app.use("/api/initiatives", initiativesRouter);

    mockInitiative.create.mockResolvedValue({
      id: "i-new",
      title: "Epic A",
      isEpic: true,
      productId: "p1",
      domainId: "d1",
      ...minimalIncludePayload,
    });

    await request(app)
      .post("/api/initiatives")
      .send({
        title: "Epic A",
        productId: "p1",
        domainId: "d1",
        priority: Priority.P2,
        horizon: Horizon.NEXT,
        status: InitiativeStatus.IDEA,
        commercialType: CommercialType.CONTRACT_ENABLER,
        isGap: false,
        isEpic: true,
      })
      .expect(201);

    expect(mockInitiative.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isEpic: true }),
      })
    );
  });

  it("POST defaults isEpic false when omitted", async () => {
    const app = express();
    app.use(express.json());
    app.use(authEditor());
    app.use(stubTenant("MEMBER"));
    app.use("/api/initiatives", initiativesRouter);

    mockInitiative.create.mockResolvedValue({
      id: "i2",
      title: "Board",
      isEpic: false,
      ...minimalIncludePayload,
      domainId: "d1",
    });

    await request(app)
      .post("/api/initiatives")
      .send({
        title: "Board",
        domainId: "d1",
        priority: Priority.P2,
        horizon: Horizon.NEXT,
        status: InitiativeStatus.IDEA,
        commercialType: CommercialType.CONTRACT_ENABLER,
      })
      .expect(201);

    expect(mockInitiative.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isEpic: false }),
      })
    );
  });
});

function mockTx() {
  const txInitiative = { update: vi.fn().mockResolvedValue({}) };
  const tx = {
    initiative: txInitiative,
    initiativePersonaImpact: { deleteMany: vi.fn(), createMany: vi.fn() },
    initiativeRevenueStream: { deleteMany: vi.fn(), createMany: vi.fn() },
    demandLink: { deleteMany: vi.fn(), createMany: vi.fn() },
    initiativeAssignment: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(async (fn: (t: typeof tx) => Promise<void>) => {
    await fn(tx);
  });
  return txInitiative;
}

describe("PUT isEpic admin-only", () => {
  it("EDITOR cannot change isEpic (update omits it)", async () => {
    const app = express();
    app.use(express.json());
    app.use(authEditor());
    app.use(stubTenant("MEMBER"));
    app.use("/api/initiatives", initiativesRouter);

    const txInitiative = mockTx();

    mockInitiative.findUnique
      .mockResolvedValueOnce({ id: "i1", status: InitiativeStatus.IDEA, ownerId: "ed1" })
      .mockResolvedValueOnce({ ownerId: "ed1", assignments: [] })
      .mockResolvedValueOnce({
        id: "i1",
        title: "T2",
        isEpic: false,
        domainId: "d1",
        status: InitiativeStatus.IDEA,
        ...minimalIncludePayload,
      });

    await request(app)
      .put("/api/initiatives/i1")
      .send({ title: "T2", isEpic: true, domainId: "d1" })
      .expect(200);

    expect(txInitiative.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ isEpic: true }),
      })
    );
  });

  it("ADMIN can set isEpic", async () => {
    const app = express();
    app.use(express.json());
    app.use(authAdmin());
    app.use(stubTenant("ADMIN"));
    app.use("/api/initiatives", initiativesRouter);

    const txInitiative = mockTx();

    mockInitiative.findUnique
      .mockResolvedValueOnce({ id: "i1", status: InitiativeStatus.IDEA, ownerId: null })
      .mockResolvedValueOnce({
        id: "i1",
        title: "T",
        isEpic: true,
        domainId: "d1",
        status: InitiativeStatus.IDEA,
        ...minimalIncludePayload,
      });

    await request(app)
      .put("/api/initiatives/i1")
      .send({ isEpic: true, domainId: "d1" })
      .expect(200);

    expect(txInitiative.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isEpic: true }),
      })
    );
  });
});
