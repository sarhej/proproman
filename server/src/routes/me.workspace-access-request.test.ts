import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";
import { meSessionRouter } from "./me.js";

const transactionalMocks = vi.hoisted(() => ({
  isTransactionalEmailEnabled: vi.fn(() => false),
  sendTransactionalEmail: vi.fn(),
  logTransactionalEmail: vi.fn(),
}));

vi.mock("../services/transactionalMail.js", () => transactionalMocks);

vi.mock("../db.js", () => ({
  prisma: {},
  prismaUnscoped: {
    tenant: { findFirst: vi.fn() },
    tenantMembership: { findUnique: vi.fn(), findMany: vi.fn() },
    workspaceAccessRequest: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { prismaUnscoped } from "../db.js";

const mockTenantFindFirst = prismaUnscoped.tenant.findFirst as ReturnType<typeof vi.fn>;
const mockMembershipFindUnique = prismaUnscoped.tenantMembership.findUnique as ReturnType<typeof vi.fn>;
const mockTenantMembershipFindMany = prismaUnscoped.tenantMembership.findMany as ReturnType<typeof vi.fn>;
const mockAccessFindUnique = prismaUnscoped.workspaceAccessRequest.findUnique as ReturnType<typeof vi.fn>;
const mockAccessCreate = prismaUnscoped.workspaceAccessRequest.create as ReturnType<typeof vi.fn>;
const mockAccessUpdate = prismaUnscoped.workspaceAccessRequest.update as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prismaUnscoped.user.findUnique as ReturnType<typeof vi.fn>;

function sessionAs(email: string, role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: "u-req",
      email,
      name: "Requester",
      role,
      isActive: true,
      activeTenantId: null,
    } as Express.User;
    next();
  };
}

describe("GET /api/me/workspace-access-request auth", () => {
  it("returns 401 when not logged in", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
      next();
    });
    app.use("/api/me", meSessionRouter);

    const res = await request(app).get("/api/me/workspace-access-request?tenantSlug=acme");
    expect(res.status).toBe(401);
  });

  it("returns 400 when tenantSlug missing", async () => {
    const app = express();
    app.use(express.json());
    app.use(sessionAs("a@b.co", UserRole.EDITOR));
    app.use("/api/me", meSessionRouter);

    const res = await request(app).get("/api/me/workspace-access-request");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/me/workspace-access-request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantFindFirst.mockResolvedValue({ id: "t1" });
    mockAccessFindUnique.mockResolvedValue(null);
  });

  it("returns pending false when no row", async () => {
    const app = express();
    app.use(express.json());
    app.use(sessionAs("a@b.co", UserRole.EDITOR));
    app.use("/api/me", meSessionRouter);

    const res = await request(app).get("/api/me/workspace-access-request?tenantSlug=acme");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pending: false });
  });

  it("returns pending true when row is PENDING", async () => {
    mockAccessFindUnique.mockResolvedValue({ status: "PENDING" });
    const app = express();
    app.use(express.json());
    app.use(sessionAs("a@b.co", UserRole.EDITOR));
    app.use("/api/me", meSessionRouter);

    const res = await request(app).get("/api/me/workspace-access-request?tenantSlug=Acme");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pending: true });
  });

  it("returns 404 when tenant not active", async () => {
    mockTenantFindFirst.mockResolvedValue(null);
    const app = express();
    app.use(express.json());
    app.use(sessionAs("a@b.co", UserRole.EDITOR));
    app.use("/api/me", meSessionRouter);

    const res = await request(app).get("/api/me/workspace-access-request?tenantSlug=missing");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/me/workspace-access-request auth", () => {
  it("returns 401 when not logged in", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
      next();
    });
    app.use("/api/me", meSessionRouter);

    const res = await request(app).post("/api/me/workspace-access-request").send({ tenantSlug: "acme" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/me/workspace-access-request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionalMocks.isTransactionalEmailEnabled.mockReturnValue(false);
    mockTenantFindFirst.mockResolvedValue({ id: "t1", name: "Acme", slug: "acme" });
    mockMembershipFindUnique.mockResolvedValue(null);
    mockAccessFindUnique.mockResolvedValue(null);
    mockAccessCreate.mockResolvedValue({ id: "war1" });
    mockUserFindUnique.mockResolvedValue({ email: "req@co", name: "Req" });
    mockTenantMembershipFindMany.mockResolvedValue([{ user: { email: "admin@co", isActive: true } }]);
  });

  it("allows platform PENDING user", async () => {
    const app = express();
    app.use(express.json());
    app.use(sessionAs("pending@co", UserRole.PENDING));
    app.use("/api/me", meSessionRouter);

    const res = await request(app).post("/api/me/workspace-access-request").send({ tenantSlug: "acme" });

    expect(res.status).toBe(200);
    expect(res.body.pending).toBe(true);
    expect(mockAccessCreate).toHaveBeenCalled();
  });

  it("returns 409 when already a member", async () => {
    mockMembershipFindUnique.mockResolvedValue({ id: "m1" });
    const app = express();
    app.use(express.json());
    app.use(sessionAs("a@b.co", UserRole.EDITOR));
    app.use("/api/me", meSessionRouter);

    const res = await request(app).post("/api/me/workspace-access-request").send({ tenantSlug: "acme" });
    expect(res.status).toBe(409);
    expect(mockAccessCreate).not.toHaveBeenCalled();
  });

  it("returns alreadyRequested when PENDING row exists", async () => {
    mockAccessFindUnique.mockResolvedValue({ id: "war1", status: "PENDING" });
    const app = express();
    app.use(express.json());
    app.use(sessionAs("a@b.co", UserRole.EDITOR));
    app.use("/api/me", meSessionRouter);

    const res = await request(app).post("/api/me/workspace-access-request").send({ tenantSlug: "acme" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pending: true, alreadyRequested: true, adminsNotified: false });
    expect(mockAccessCreate).not.toHaveBeenCalled();
  });

  it("sends email to admins when transactional email enabled", async () => {
    transactionalMocks.isTransactionalEmailEnabled.mockReturnValue(true);
    mockAccessFindUnique.mockResolvedValue(null);

    const app = express();
    app.use(express.json());
    app.use(sessionAs("req@co", UserRole.EDITOR));
    app.use("/api/me", meSessionRouter);

    const res = await request(app).post("/api/me/workspace-access-request").send({ tenantSlug: "acme" });

    expect(res.status).toBe(200);
    expect(res.body.adminsNotified).toBe(true);
    expect(transactionalMocks.sendTransactionalEmail).toHaveBeenCalled();
  });

  it("reactivates FULFILLED row to PENDING", async () => {
    mockAccessFindUnique.mockResolvedValue({ id: "war-old", status: "FULFILLED" });
    const app = express();
    app.use(express.json());
    app.use(sessionAs("a@b.co", UserRole.EDITOR));
    app.use("/api/me", meSessionRouter);

    const res = await request(app).post("/api/me/workspace-access-request").send({ tenantSlug: "acme" });
    expect(res.status).toBe(200);
    expect(mockAccessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "war-old" },
        data: { status: "PENDING" },
      })
    );
    expect(mockAccessCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when body invalid", async () => {
    const app = express();
    app.use(express.json());
    app.use(sessionAs("a@b.co", UserRole.EDITOR));
    app.use("/api/me", meSessionRouter);

    const res = await request(app).post("/api/me/workspace-access-request").send({});
    expect(res.status).toBe(400);
    expect(mockAccessCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when tenant not found", async () => {
    mockTenantFindFirst.mockResolvedValue(null);
    const app = express();
    app.use(express.json());
    app.use(sessionAs("a@b.co", UserRole.EDITOR));
    app.use("/api/me", meSessionRouter);

    const res = await request(app).post("/api/me/workspace-access-request").send({ tenantSlug: "ghost" });
    expect(res.status).toBe(404);
    expect(mockAccessCreate).not.toHaveBeenCalled();
  });
});
