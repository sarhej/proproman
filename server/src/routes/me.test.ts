import { describe, it, expect } from "vitest";
import { z } from "zod";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole, DeliveryChannel } from "@prisma/client";

const switchTenantSchema = z.object({
  tenantId: z.string().min(1),
});

const patchPreferencesSchema = z.object({
  preferences: z.array(
    z.object({
      channel: z.enum(["IN_APP", "EMAIL", "SLACK", "WHATSAPP"]),
      enabled: z.boolean(),
      channelIdentifier: z.string().optional().nullable(),
    })
  ),
});

describe("switchTenantSchema validation", () => {
  it("accepts valid tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: "t-123" });
    expect(result.success).toBe(true);
  });

  it("rejects missing tenantId", () => {
    const result = switchTenantSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects null tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: null });
    expect(result.success).toBe(false);
  });

  it("rejects numeric tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects array tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: ["t-1"] });
    expect(result.success).toBe(false);
  });

  it("rejects boolean tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: true });
    expect(result.success).toBe(false);
  });

  it("accepts UUID tenantId", () => {
    const result = switchTenantSchema.safeParse({
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("ignores extra fields", () => {
    const result = switchTenantSchema.safeParse({ tenantId: "t-1", extra: "ignored" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tenantId).toBe("t-1");
  });
});

describe("patchPreferencesSchema validation", () => {
  it("accepts valid preferences array", () => {
    const result = patchPreferencesSchema.safeParse({
      preferences: [
        { channel: "IN_APP", enabled: true },
        { channel: "EMAIL", enabled: false, channelIdentifier: "test@example.com" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty preferences array", () => {
    const result = patchPreferencesSchema.safeParse({ preferences: [] });
    expect(result.success).toBe(true);
  });

  it("rejects missing preferences", () => {
    const result = patchPreferencesSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid channel name", () => {
    const result = patchPreferencesSchema.safeParse({
      preferences: [{ channel: "SMS", enabled: true }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing enabled flag", () => {
    const result = patchPreferencesSchema.safeParse({
      preferences: [{ channel: "IN_APP" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts null channelIdentifier", () => {
    const result = patchPreferencesSchema.safeParse({
      preferences: [{ channel: "SLACK", enabled: true, channelIdentifier: null }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects enabled as string", () => {
    const result = patchPreferencesSchema.safeParse({
      preferences: [{ channel: "IN_APP", enabled: "true" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all four channel types", () => {
    const channels = ["IN_APP", "EMAIL", "SLACK", "WHATSAPP"] as const;
    for (const channel of channels) {
      const result = patchPreferencesSchema.safeParse({
        preferences: [{ channel, enabled: true }],
      });
      expect(result.success, `${channel} should be valid`).toBe(true);
    }
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

describe("/me route RBAC (HTTP)", () => {
  let meRouter: express.Router;
  let appNoAuth: express.Express;
  let appPending: express.Express;
  let appDeactivated: express.Express;

  it("loads router", async () => {
    const mod = await import("./me.js");
    meRouter = mod.meRouter;

    appNoAuth = express();
    appNoAuth.use(express.json());
    appNoAuth.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
      next();
    });
    appNoAuth.use("/api/me", meRouter);

    appPending = express();
    appPending.use(express.json());
    appPending.use(authAs("p1", UserRole.PENDING));
    appPending.use("/api/me", meRouter);

    appDeactivated = express();
    appDeactivated.use(express.json());
    appDeactivated.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      (req as unknown as { user: Express.User }).user = {
        id: "d1",
        email: "d1@test.local",
        name: "Deactivated",
        role: UserRole.EDITOR,
        isActive: false,
        activeTenantId: null,
      } as Express.User;
      next();
    });
    appDeactivated.use("/api/me", meRouter);
  });

  it("unauthenticated user cannot access /me/tenants", async () => {
    const res = await request(appNoAuth).get("/api/me/tenants");
    expect(res.status).toBe(401);
  });

  it("PENDING user cannot access /me/tenants", async () => {
    const res = await request(appPending).get("/api/me/tenants");
    expect(res.status).toBe(403);
  });

  it("deactivated user cannot access /me/tenants", async () => {
    const res = await request(appDeactivated).get("/api/me/tenants");
    expect(res.status).toBe(403);
  });

  it("unauthenticated user cannot switch tenant", async () => {
    const res = await request(appNoAuth)
      .post("/api/me/tenants/switch")
      .send({ tenantId: "t-1" });
    expect(res.status).toBe(401);
  });

  it("PENDING user cannot switch tenant", async () => {
    const res = await request(appPending)
      .post("/api/me/tenants/switch")
      .send({ tenantId: "t-1" });
    expect(res.status).toBe(403);
  });

  it("unauthenticated user cannot access notification preferences", async () => {
    const res = await request(appNoAuth).get("/api/me/notification-preferences");
    expect(res.status).toBe(401);
  });

  it("unauthenticated user cannot update notification preferences", async () => {
    const res = await request(appNoAuth)
      .patch("/api/me/notification-preferences")
      .send({ preferences: [] });
    expect(res.status).toBe(401);
  });
});
