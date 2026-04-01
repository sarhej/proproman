import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";

const { mockResolveActiveTenant } = vi.hoisted(() => ({
  mockResolveActiveTenant: vi.fn(),
}));

vi.mock("../lib/resolveActiveTenantForUser.js", () => ({
  resolveActiveTenantForAuthenticatedUser: (...args: unknown[]) => mockResolveActiveTenant(...args),
}));

import { authRouter } from "./auth.js";

function sessionAndUser(user: Express.User) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { sessionID: string }).sessionID = "sess-test";
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = user;
    next();
  };
}

describe("GET /api/auth/me activeTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns activeTenant from resolver when membership is valid", async () => {
    mockResolveActiveTenant.mockResolvedValue({
      id: "t1",
      name: "Acme",
      slug: "acme",
      status: "ACTIVE",
      isSystem: false,
    });

    const app = express();
    app.use(
      sessionAndUser({
        id: "u1",
        email: "u@test.local",
        name: "U",
        role: UserRole.EDITOR,
        isActive: true,
        activeTenantId: "t1",
      } as Express.User)
    );
    app.use("/api/auth", authRouter);

    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: "u1" });
    expect(res.body.activeTenant).toEqual({
      id: "t1",
      name: "Acme",
      slug: "acme",
      status: "ACTIVE",
      isSystem: false,
    });
    expect(mockResolveActiveTenant).toHaveBeenCalledWith("u1", "t1");
  });

  it("returns activeTenant null when resolver finds no membership (stale activeTenantId)", async () => {
    mockResolveActiveTenant.mockResolvedValue(null);

    const app = express();
    app.use(
      sessionAndUser({
        id: "u1",
        email: "u@test.local",
        name: "U",
        role: UserRole.EDITOR,
        isActive: true,
        activeTenantId: "revoked-tenant",
      } as Express.User)
    );
    app.use("/api/auth", authRouter);

    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.activeTenant).toBeNull();
    expect(mockResolveActiveTenant).toHaveBeenCalledWith("u1", "revoked-tenant");
  });

  it("passes tenantContext tenantId when present on request", async () => {
    mockResolveActiveTenant.mockResolvedValue({
      id: "t-header",
      name: "From Header",
      slug: "hdr",
      status: "ACTIVE",
      isSystem: false,
    });

    const app = express();
    app.use(
      sessionAndUser({
        id: "u1",
        email: "u@test.local",
        name: "U",
        role: UserRole.EDITOR,
        isActive: true,
        activeTenantId: "t-stale-in-db",
      } as Express.User)
    );
    app.use((req, _res, next) => {
      (req as unknown as { tenantContext: { tenantId: string } }).tenantContext = { tenantId: "t-header" };
      next();
    });
    app.use("/api/auth", authRouter);

    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(mockResolveActiveTenant).toHaveBeenCalledWith("u1", "t-header");
  });
});
