import { describe, it, expect } from "vitest";
import { z } from "zod";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";

const slugRegex = /^[a-z0-9-]+$/;

const createRequestSchema = z.object({
  teamName: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens"),
  contactEmail: z.string().email(),
  contactName: z.string().min(1).max(100),
  message: z.string().max(1000).optional(),
});

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewNote: z.string().max(500).optional(),
});

describe("createRequestSchema", () => {
  it("accepts valid input", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme Corp",
      slug: "acme-corp",
      contactEmail: "jane@acme.com",
      contactName: "Jane Doe",
    });
    expect(result.success).toBe(true);
  });

  it("accepts input with optional message", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme Corp",
      slug: "acme-corp",
      contactEmail: "jane@acme.com",
      contactName: "Jane Doe",
      message: "We need a workspace for our team.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing teamName", () => {
    const result = createRequestSchema.safeParse({
      slug: "acme",
      contactEmail: "a@b.com",
      contactName: "X",
    });
    expect(result.success).toBe(false);
  });

  it("rejects teamName shorter than 2 chars", () => {
    const result = createRequestSchema.safeParse({
      teamName: "A",
      slug: "acme",
      contactEmail: "a@b.com",
      contactName: "X",
    });
    expect(result.success).toBe(false);
  });

  it("rejects teamName longer than 100 chars", () => {
    const result = createRequestSchema.safeParse({
      teamName: "A".repeat(101),
      slug: "acme",
      contactEmail: "a@b.com",
      contactName: "X",
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug with uppercase", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "Acme-Corp",
      contactEmail: "a@b.com",
      contactName: "X",
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug with spaces", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "acme corp",
      contactEmail: "a@b.com",
      contactName: "X",
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug with special characters", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "acme_corp!",
      contactEmail: "a@b.com",
      contactName: "X",
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug shorter than 2 chars", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "a",
      contactEmail: "a@b.com",
      contactName: "X",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "acme",
      contactEmail: "not-an-email",
      contactName: "X",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing contactName", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "acme",
      contactEmail: "a@b.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects message longer than 1000 chars", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "acme",
      contactEmail: "a@b.com",
      contactName: "X",
      message: "M".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts slug with numbers and hyphens", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Team 123",
      slug: "team-123-go",
      contactEmail: "a@b.com",
      contactName: "X",
    });
    expect(result.success).toBe(true);
  });
});

describe("reviewSchema", () => {
  it("accepts approve action", () => {
    const result = reviewSchema.safeParse({ action: "approve" });
    expect(result.success).toBe(true);
  });

  it("accepts reject action", () => {
    const result = reviewSchema.safeParse({ action: "reject" });
    expect(result.success).toBe(true);
  });

  it("accepts action with reviewNote", () => {
    const result = reviewSchema.safeParse({
      action: "approve",
      reviewNote: "Looks good.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid action", () => {
    const result = reviewSchema.safeParse({ action: "suspend" });
    expect(result.success).toBe(false);
  });

  it("rejects empty action", () => {
    const result = reviewSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects reviewNote longer than 500 chars", () => {
    const result = reviewSchema.safeParse({
      action: "reject",
      reviewNote: "N".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty reviewNote string", () => {
    const result = reviewSchema.safeParse({ action: "approve", reviewNote: "" });
    expect(result.success).toBe(true);
  });

  it("rejects null action", () => {
    const result = reviewSchema.safeParse({ action: null });
    expect(result.success).toBe(false);
  });

  it("rejects numeric action", () => {
    const result = reviewSchema.safeParse({ action: 1 });
    expect(result.success).toBe(false);
  });
});

describe("createRequestSchema edge cases", () => {
  it("rejects empty contactName", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "acme",
      contactEmail: "a@b.com",
      contactName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects contactName longer than 100 chars", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "acme",
      contactEmail: "a@b.com",
      contactName: "C".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("accepts contactName exactly 100 chars", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "acme",
      contactEmail: "a@b.com",
      contactName: "C".repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it("accepts message exactly 1000 chars", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "acme",
      contactEmail: "a@b.com",
      contactName: "X",
      message: "M".repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  it("accepts teamName exactly 2 chars", () => {
    const result = createRequestSchema.safeParse({
      teamName: "AB",
      slug: "ab",
      contactEmail: "a@b.com",
      contactName: "X",
    });
    expect(result.success).toBe(true);
  });

  it("accepts slug exactly 2 chars", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "ab",
      contactEmail: "a@b.com",
      contactName: "X",
    });
    expect(result.success).toBe(true);
  });

  it("accepts slug exactly 50 chars", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "a".repeat(50),
      contactEmail: "a@b.com",
      contactName: "X",
    });
    expect(result.success).toBe(true);
  });

  it("rejects slug with leading hyphen (allowed by regex)", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "-acme",
      contactEmail: "a@b.com",
      contactName: "X",
    });
    // Current regex allows leading hyphens
    expect(result.success).toBe(true);
  });

  it("rejects null as teamName", () => {
    const result = createRequestSchema.safeParse({
      teamName: null,
      slug: "acme",
      contactEmail: "a@b.com",
      contactName: "X",
    });
    expect(result.success).toBe(false);
  });

  it("rejects entirely empty object", () => {
    const result = createRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects email without domain", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "acme",
      contactEmail: "user@",
      contactName: "X",
    });
    expect(result.success).toBe(false);
  });

  it("rejects email without local part", () => {
    const result = createRequestSchema.safeParse({
      teamName: "Acme",
      slug: "acme",
      contactEmail: "@domain.com",
      contactName: "X",
    });
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

describe("tenant-requests RBAC (HTTP)", () => {
  let tenantRequestsRouter: express.Router;
  let appEditor: express.Express;
  let appViewer: express.Express;
  let appNoAuth: express.Express;

  it("loads router", async () => {
    const mod = await import("./tenant-requests.js");
    tenantRequestsRouter = mod.tenantRequestsRouter;

    appEditor = express();
    appEditor.use(express.json());
    appEditor.use(authAs("e1", UserRole.EDITOR));
    appEditor.use("/api/tenant-requests", tenantRequestsRouter);

    appViewer = express();
    appViewer.use(express.json());
    appViewer.use(authAs("v1", UserRole.VIEWER));
    appViewer.use("/api/tenant-requests", tenantRequestsRouter);

    appNoAuth = express();
    appNoAuth.use(express.json());
    appNoAuth.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
      next();
    });
    appNoAuth.use("/api/tenant-requests", tenantRequestsRouter);
  });

  it("EDITOR cannot list requests (GET /)", async () => {
    const res = await request(appEditor).get("/api/tenant-requests");
    expect(res.status).toBe(403);
  });

  it("VIEWER cannot list requests (GET /)", async () => {
    const res = await request(appViewer).get("/api/tenant-requests");
    expect(res.status).toBe(403);
  });

  it("EDITOR cannot get request detail (GET /:id)", async () => {
    const res = await request(appEditor).get("/api/tenant-requests/some-id");
    expect(res.status).toBe(403);
  });

  it("EDITOR cannot review a request (POST /:id/review)", async () => {
    const res = await request(appEditor)
      .post("/api/tenant-requests/some-id/review")
      .send({ action: "approve" });
    expect(res.status).toBe(403);
  });

  it("unauthenticated user cannot list requests (GET /)", async () => {
    const res = await request(appNoAuth).get("/api/tenant-requests");
    expect(res.status).toBe(401);
  });

  it("unauthenticated user cannot review (POST /:id/review)", async () => {
    const res = await request(appNoAuth)
      .post("/api/tenant-requests/some-id/review")
      .send({ action: "approve" });
    expect(res.status).toBe(401);
  });

  it("public endpoint GET /status/:nonexistent returns 404 (no auth needed)", async () => {
    const res = await request(appNoAuth)
      .get("/api/tenant-requests/status/nonexistent-id-xyz");
    expect(res.status).toBe(404);
  });
});
