import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";
import { meSessionRouter } from "./me.js";

vi.mock("../db.js", () => ({
  prisma: {},
  prismaUnscoped: {
    tenantRequest: { findMany: vi.fn() },
  },
}));

import { prismaUnscoped } from "../db.js";

const mockFindMany = prismaUnscoped.tenantRequest.findMany as ReturnType<typeof vi.fn>;

function sessionAs(email: string, role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: "u1",
      email,
      name: "Test",
      role,
      isActive: true,
      activeTenantId: null,
    } as Express.User;
    next();
  };
}

describe("GET /api/me/workspace-registration-requests", () => {
  const app = express();
  app.use(express.json());
  app.use(sessionAs("requester@example.com", UserRole.ADMIN));
  app.use("/api/me", meSessionRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns requests matched by contact email (case-insensitive)", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "tr1",
        teamName: "Nakam",
        slug: "nakamapi",
        status: "PENDING",
        createdAt: new Date("2026-01-01"),
        reviewNote: null,
      },
    ]);

    const res = await request(app).get("/api/me/workspace-registration-requests");

    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0].slug).toBe("nakamapi");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contactEmail: { equals: "requester@example.com", mode: "insensitive" } },
      })
    );
  });
});

describe("GET /api/me/workspace-registration-requests auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not logged in", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
      next();
    });
    app.use("/api/me", meSessionRouter);

    const res = await request(app).get("/api/me/workspace-registration-requests");
    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("allows PENDING role (session-only)", async () => {
    const app = express();
    app.use(express.json());
    app.use(sessionAs("pending@example.com", UserRole.PENDING));
    app.use("/api/me", meSessionRouter);
    mockFindMany.mockResolvedValue([]);

    const res = await request(app).get("/api/me/workspace-registration-requests");

    expect(res.status).toBe(200);
    expect(res.body.requests).toEqual([]);
  });
});
