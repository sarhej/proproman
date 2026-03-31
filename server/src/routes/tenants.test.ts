import { describe, it, expect } from "vitest";
import { z } from "zod";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";

/**
 * Zod schema validation tests for tenant admin routes.
 * These mirror the schemas defined in routes/tenants.ts.
 */

const createTenantInput = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

const updateTenantInput = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
});

describe("createTenantInput validation", () => {
  it("accepts valid name and slug", () => {
    const result = createTenantInput.safeParse({ name: "Acme Corp", slug: "acme-corp" });
    expect(result.success).toBe(true);
  });

  it("accepts slug with numbers", () => {
    const result = createTenantInput.safeParse({ name: "Test", slug: "team-123" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createTenantInput.safeParse({ name: "", slug: "acme" });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 100 chars", () => {
    const result = createTenantInput.safeParse({ name: "x".repeat(101), slug: "acme" });
    expect(result.success).toBe(false);
  });

  it("rejects slug with 1 char (min is 2)", () => {
    const result = createTenantInput.safeParse({ name: "Test", slug: "a" });
    expect(result.success).toBe(false);
  });

  it("rejects slug exceeding 50 chars", () => {
    const result = createTenantInput.safeParse({ name: "Test", slug: "a".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("rejects slug with uppercase letters", () => {
    const result = createTenantInput.safeParse({ name: "Test", slug: "Acme" });
    expect(result.success).toBe(false);
  });

  it("rejects slug with underscores", () => {
    const result = createTenantInput.safeParse({ name: "Test", slug: "acme_corp" });
    expect(result.success).toBe(false);
  });

  it("rejects slug with spaces", () => {
    const result = createTenantInput.safeParse({ name: "Test", slug: "acme corp" });
    expect(result.success).toBe(false);
  });

  it("rejects slug with special characters", () => {
    const result = createTenantInput.safeParse({ name: "Test", slug: "acme!@#" });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = createTenantInput.safeParse({ slug: "acme" });
    expect(result.success).toBe(false);
  });

  it("rejects missing slug", () => {
    const result = createTenantInput.safeParse({ name: "Acme" });
    expect(result.success).toBe(false);
  });

  it("rejects entirely empty body", () => {
    const result = createTenantInput.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("updateTenantInput validation", () => {
  it("accepts partial update with name only", () => {
    const result = updateTenantInput.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with status only", () => {
    const result = updateTenantInput.safeParse({ status: "SUSPENDED" });
    expect(result.success).toBe(true);
  });

  it("accepts both name and status", () => {
    const result = updateTenantInput.safeParse({ name: "Updated", status: "ACTIVE" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (no-op update)", () => {
    const result = updateTenantInput.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = updateTenantInput.safeParse({ status: "DELETED" });
    expect(result.success).toBe(false);
  });

  it("rejects PROVISIONING status (only ACTIVE/SUSPENDED allowed)", () => {
    const result = updateTenantInput.safeParse({ status: "PROVISIONING" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = updateTenantInput.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 100 chars", () => {
    const result = updateTenantInput.safeParse({ name: "x".repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe("addMemberSchema validation", () => {
  it("accepts userId with default role (MEMBER)", () => {
    const result = addMemberSchema.safeParse({ userId: "user-123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("MEMBER");
    }
  });

  it("accepts explicit role", () => {
    const result = addMemberSchema.safeParse({ userId: "user-1", role: "ADMIN" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("ADMIN");
    }
  });

  it("accepts OWNER role", () => {
    const result = addMemberSchema.safeParse({ userId: "user-1", role: "OWNER" });
    expect(result.success).toBe(true);
  });

  it("accepts VIEWER role", () => {
    const result = addMemberSchema.safeParse({ userId: "user-1", role: "VIEWER" });
    expect(result.success).toBe(true);
  });

  it("rejects missing userId", () => {
    const result = addMemberSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty userId", () => {
    const result = addMemberSchema.safeParse({ userId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const result = addMemberSchema.safeParse({ userId: "user-1", role: "SUPERADMIN" });
    expect(result.success).toBe(false);
  });

  it("rejects null userId", () => {
    const result = addMemberSchema.safeParse({ userId: null });
    expect(result.success).toBe(false);
  });

  it("rejects array userId", () => {
    const result = addMemberSchema.safeParse({ userId: ["user-1"] });
    expect(result.success).toBe(false);
  });

  it("rejects boolean userId", () => {
    const result = addMemberSchema.safeParse({ userId: true });
    expect(result.success).toBe(false);
  });
});

function authAs(userId: string, role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: userId,
      email: `${userId}@test.local`,
      name: "Test User",
      role,
      isActive: true,
      activeTenantId: null,
    } as Express.User;
    next();
  };
}

describe("tenants RBAC (HTTP)", () => {
  let tenantsRouter: express.Router;
  let appEditor: express.Express;
  let appViewer: express.Express;
  let appNoAuth: express.Express;

  it("loads router", async () => {
    const mod = await import("./tenants.js");
    tenantsRouter = mod.tenantsRouter;

    appEditor = express();
    appEditor.use(express.json());
    appEditor.use(authAs("e1", UserRole.EDITOR));
    appEditor.use("/api/tenants", tenantsRouter);

    appViewer = express();
    appViewer.use(express.json());
    appViewer.use(authAs("v1", UserRole.VIEWER));
    appViewer.use("/api/tenants", tenantsRouter);

    appNoAuth = express();
    appNoAuth.use(express.json());
    appNoAuth.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
      next();
    });
    appNoAuth.use("/api/tenants", tenantsRouter);
  });

  it("EDITOR cannot list tenants", async () => {
    const res = await request(appEditor).get("/api/tenants");
    expect(res.status).toBe(403);
  });

  it("VIEWER cannot list tenants", async () => {
    const res = await request(appViewer).get("/api/tenants");
    expect(res.status).toBe(403);
  });

  it("unauthenticated cannot list tenants", async () => {
    const res = await request(appNoAuth).get("/api/tenants");
    expect(res.status).toBe(401);
  });

  it("EDITOR cannot create tenant", async () => {
    const res = await request(appEditor)
      .post("/api/tenants")
      .send({ name: "Test", slug: "test" });
    expect(res.status).toBe(403);
  });

  it("EDITOR cannot get tenant detail", async () => {
    const res = await request(appEditor).get("/api/tenants/some-id");
    expect(res.status).toBe(403);
  });

  it("EDITOR cannot patch tenant", async () => {
    const res = await request(appEditor)
      .patch("/api/tenants/some-id")
      .send({ name: "New" });
    expect(res.status).toBe(403);
  });

  it("EDITOR cannot add member", async () => {
    const res = await request(appEditor)
      .post("/api/tenants/some-id/members")
      .send({ userId: "u1" });
    expect(res.status).toBe(403);
  });

  it("EDITOR cannot remove member", async () => {
    const res = await request(appEditor)
      .delete("/api/tenants/some-id/members/u1");
    expect(res.status).toBe(403);
  });

  it("EDITOR cannot provision tenant", async () => {
    const res = await request(appEditor)
      .post("/api/tenants/some-id/provision");
    expect(res.status).toBe(403);
  });

  it("EDITOR cannot backfill tenant", async () => {
    const res = await request(appEditor)
      .post("/api/tenants/some-id/backfill");
    expect(res.status).toBe(403);
  });

  it("EDITOR cannot create schema", async () => {
    const res = await request(appEditor)
      .post("/api/tenants/some-id/create-schema");
    expect(res.status).toBe(403);
  });

  it("EDITOR cannot list schemas", async () => {
    const res = await request(appEditor).get("/api/tenants/schemas/list");
    expect(res.status).toBe(403);
  });

  it("unauthenticated cannot add member", async () => {
    const res = await request(appNoAuth)
      .post("/api/tenants/some-id/members")
      .send({ userId: "u1" });
    expect(res.status).toBe(401);
  });

  it("unauthenticated cannot remove member", async () => {
    const res = await request(appNoAuth)
      .delete("/api/tenants/some-id/members/u1");
    expect(res.status).toBe(401);
  });
});
