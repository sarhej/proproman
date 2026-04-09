import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";
import {
  requireAuth,
  requireRole,
  requireSession,
  requireWriteAccess,
  requireMarketingAccess,
} from "./auth.js";

function makeAppApiKey(middleware: express.RequestHandler, userOverrides?: Partial<Express.User>) {
  const app = express();
  app.use((req, _res, next) => {
    const defaultUser: Express.User = {
      id: "u-api",
      email: "api@test.local",
      name: "API",
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      activeTenantId: null,
      ...userOverrides,
    } as Express.User;
    (req as express.Request).user = defaultUser;
    (req as express.Request).authViaApiKey = true;
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
    next();
  });
  app.use(middleware);
  app.get("/test", (_req, res) => res.json({ ok: true }));
  return app;
}

function makeApp(middleware: express.RequestHandler, userOverrides?: Partial<Express.User> | null) {
  const app = express();
  app.use((req, _res, next) => {
    if (userOverrides !== null) {
      const defaultUser: Express.User = {
        id: "u1",
        email: "u1@test.local",
        name: "Test",
        role: UserRole.EDITOR,
        isActive: true,
        activeTenantId: null,
        ...userOverrides,
      } as Express.User;
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      (req as unknown as { user: Express.User }).user = defaultUser;
    } else {
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
    }
    next();
  });
  app.use(middleware);
  app.get("/test", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("requireAuth", () => {
  it("allows API-key user without passport session when authViaApiKey is set", async () => {
    const res = await request(makeAppApiKey(requireAuth)).get("/test");
    expect(res.status).toBe(200);
  });

  it("allows authenticated active user", async () => {
    const res = await request(makeApp(requireAuth)).get("/test");
    expect(res.status).toBe(200);
  });

  it("rejects unauthenticated request with 401", async () => {
    const res = await request(makeApp(requireAuth, null)).get("/test");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("rejects deactivated user with 403", async () => {
    const res = await request(makeApp(requireAuth, { isActive: false })).get("/test");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Account deactivated");
  });

  it("rejects PENDING user with 403", async () => {
    const res = await request(makeApp(requireAuth, { role: UserRole.PENDING })).get("/test");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("PENDING_APPROVAL");
  });
});

describe("requireSession", () => {
  it("allows API-key user without passport session when authViaApiKey is set", async () => {
    const res = await request(makeAppApiKey(requireSession)).get("/test");
    expect(res.status).toBe(200);
  });

  it("allows PENDING user", async () => {
    const res = await request(makeApp(requireSession, { role: UserRole.PENDING })).get("/test");
    expect(res.status).toBe(200);
  });

  it("rejects unauthenticated request with 401", async () => {
    const res = await request(makeApp(requireSession, null)).get("/test");
    expect(res.status).toBe(401);
  });

  it("rejects deactivated user with 403", async () => {
    const res = await request(makeApp(requireSession, { isActive: false })).get("/test");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Account deactivated");
  });
});

describe("requireRole", () => {
  it("allows user with matching role", async () => {
    const mw = requireRole(UserRole.EDITOR);
    const res = await request(makeApp(mw, { role: UserRole.EDITOR })).get("/test");
    expect(res.status).toBe(200);
  });

  it("allows SUPER_ADMIN regardless of required role", async () => {
    const mw = requireRole(UserRole.EDITOR);
    const res = await request(makeApp(mw, { role: UserRole.SUPER_ADMIN })).get("/test");
    expect(res.status).toBe(200);
  });

  it("rejects user with wrong role", async () => {
    const mw = requireRole(UserRole.ADMIN);
    const res = await request(makeApp(mw, { role: UserRole.VIEWER })).get("/test");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("rejects unauthenticated user with 401", async () => {
    const mw = requireRole(UserRole.ADMIN);
    const res = await request(makeApp(mw, null)).get("/test");
    expect(res.status).toBe(401);
  });

  it("rejects deactivated user even with correct role", async () => {
    const mw = requireRole(UserRole.ADMIN);
    const res = await request(makeApp(mw, { role: UserRole.ADMIN, isActive: false })).get("/test");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Account deactivated");
  });

  it("rejects PENDING user even if PENDING is the required role", async () => {
    const mw = requireRole(UserRole.PENDING);
    const res = await request(makeApp(mw, { role: UserRole.PENDING })).get("/test");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("PENDING_APPROVAL");
  });

  it("allows when user has one of multiple allowed roles", async () => {
    const mw = requireRole(UserRole.ADMIN, UserRole.EDITOR);
    const res = await request(makeApp(mw, { role: UserRole.EDITOR })).get("/test");
    expect(res.status).toBe(200);
  });

  it("rejects MARKETING when only ADMIN/EDITOR required", async () => {
    const mw = requireRole(UserRole.ADMIN, UserRole.EDITOR);
    const res = await request(makeApp(mw, { role: UserRole.MARKETING })).get("/test");
    expect(res.status).toBe(403);
  });
});

describe("requireWriteAccess", () => {
  it("allows ADMIN", async () => {
    const res = await request(makeApp(requireWriteAccess(), { role: UserRole.ADMIN })).get("/test");
    expect(res.status).toBe(200);
  });

  it("allows EDITOR", async () => {
    const res = await request(makeApp(requireWriteAccess(), { role: UserRole.EDITOR })).get("/test");
    expect(res.status).toBe(200);
  });

  it("allows SUPER_ADMIN", async () => {
    const res = await request(makeApp(requireWriteAccess(), { role: UserRole.SUPER_ADMIN })).get("/test");
    expect(res.status).toBe(200);
  });

  it("rejects VIEWER", async () => {
    const res = await request(makeApp(requireWriteAccess(), { role: UserRole.VIEWER })).get("/test");
    expect(res.status).toBe(403);
  });

  it("rejects MARKETING", async () => {
    const res = await request(makeApp(requireWriteAccess(), { role: UserRole.MARKETING })).get("/test");
    expect(res.status).toBe(403);
  });
});

describe("requireMarketingAccess", () => {
  it("allows MARKETING", async () => {
    const res = await request(makeApp(requireMarketingAccess(), { role: UserRole.MARKETING })).get("/test");
    expect(res.status).toBe(200);
  });

  it("allows ADMIN", async () => {
    const res = await request(makeApp(requireMarketingAccess(), { role: UserRole.ADMIN })).get("/test");
    expect(res.status).toBe(200);
  });

  it("rejects EDITOR", async () => {
    const res = await request(makeApp(requireMarketingAccess(), { role: UserRole.EDITOR })).get("/test");
    expect(res.status).toBe(403);
  });
});
