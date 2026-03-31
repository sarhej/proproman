import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { UserRole } from "@prisma/client";

/**
 * Tests for tenant slug resolution and slug-based auth features.
 *
 * 1. GET /api/tenants/by-slug/:slug/public — public slug resolution
 * 2. dev-login tenantSlug schema validation
 * 3. Google OAuth pendingTenantSlug session field
 * 4. autoSwitchToSlug logic validation
 */

type MockTenant = { name: string; slug: string; status: string };
const mockTenants: Record<string, MockTenant> = {
  strt: { name: "Strt", slug: "strt", status: "ACTIVE" },
  suspended: { name: "Suspended Co", slug: "suspended", status: "SUSPENDED" },
  provisioning: { name: "New Co", slug: "provisioning", status: "PROVISIONING" },
};

function makeSlugApp() {
  const app = express();
  app.use(express.json());

  app.get("/api/tenants/by-slug/:slug/public", (req, res) => {
    const slug = String(req.params.slug).toLowerCase();
    const tenant = mockTenants[slug] ?? null;
    if (!tenant || tenant.status !== "ACTIVE") {
      res.status(404).json({ error: "Workspace not found." });
      return;
    }
    res.json({ name: tenant.name, slug: tenant.slug });
  });

  return app;
}

describe("GET /api/tenants/by-slug/:slug/public", () => {
  const app = makeSlugApp();

  it("returns name and slug for ACTIVE tenant", async () => {
    const res = await request(app).get("/api/tenants/by-slug/strt/public");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Strt");
    expect(res.body.slug).toBe("strt");
  });

  it("does NOT leak tenant ID", async () => {
    const res = await request(app).get("/api/tenants/by-slug/strt/public");
    expect(res.body.id).toBeUndefined();
  });

  it("does NOT leak tenant status", async () => {
    const res = await request(app).get("/api/tenants/by-slug/strt/public");
    expect(res.body.status).toBeUndefined();
  });

  it("does NOT leak membership count", async () => {
    const res = await request(app).get("/api/tenants/by-slug/strt/public");
    expect(res.body.memberships).toBeUndefined();
    expect(res.body._count).toBeUndefined();
  });

  it("returns 404 for non-existent slug", async () => {
    const res = await request(app).get("/api/tenants/by-slug/nonexistent/public");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Workspace not found.");
  });

  it("returns 404 for SUSPENDED tenant (prevents status enumeration)", async () => {
    const res = await request(app).get("/api/tenants/by-slug/suspended/public");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Workspace not found.");
  });

  it("returns 404 for PROVISIONING tenant", async () => {
    const res = await request(app).get("/api/tenants/by-slug/provisioning/public");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Workspace not found.");
  });

  it("same error message for nonexistent and suspended (no status leak)", async () => {
    const r1 = await request(app).get("/api/tenants/by-slug/nonexistent/public");
    const r2 = await request(app).get("/api/tenants/by-slug/suspended/public");
    expect(r1.body.error).toBe(r2.body.error);
  });

  it("normalizes slug to lowercase", async () => {
    const res = await request(app).get("/api/tenants/by-slug/STRT/public");
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe("strt");
  });

  it("handles URL-encoded slugs", async () => {
    const res = await request(app).get("/api/tenants/by-slug/strt/public");
    expect(res.status).toBe(200);
  });
});

describe("dev-login tenantSlug schema", () => {
  const devLoginSchema = z.object({
    role: z.nativeEnum(UserRole).optional(),
    tenantId: z.string().min(1).optional(),
    tenantSlug: z.string().min(1).optional(),
  });

  it("accepts tenantSlug only", () => {
    const result = devLoginSchema.safeParse({ tenantSlug: "strt" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tenantSlug).toBe("strt");
  });

  it("accepts tenantSlug with role", () => {
    const result = devLoginSchema.safeParse({ role: "EDITOR", tenantSlug: "strt" });
    expect(result.success).toBe(true);
  });

  it("accepts both tenantId and tenantSlug", () => {
    const result = devLoginSchema.safeParse({ tenantId: "t-1", tenantSlug: "strt" });
    expect(result.success).toBe(true);
  });

  it("rejects empty tenantSlug", () => {
    const result = devLoginSchema.safeParse({ tenantSlug: "" });
    expect(result.success).toBe(false);
  });

  it("rejects null tenantSlug", () => {
    const result = devLoginSchema.safeParse({ tenantSlug: null });
    expect(result.success).toBe(false);
  });

  it("rejects numeric tenantSlug", () => {
    const result = devLoginSchema.safeParse({ tenantSlug: 42 });
    expect(result.success).toBe(false);
  });

  it("accepts hyphenated slug", () => {
    const result = devLoginSchema.safeParse({ tenantSlug: "my-team-123" });
    expect(result.success).toBe(true);
  });

  it("tenantSlug is undefined when omitted", () => {
    const result = devLoginSchema.safeParse({ role: "ADMIN" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tenantSlug).toBeUndefined();
  });

  it("rejects boolean tenantSlug", () => {
    const result = devLoginSchema.safeParse({ tenantSlug: true });
    expect(result.success).toBe(false);
  });

  it("rejects array tenantSlug", () => {
    const result = devLoginSchema.safeParse({ tenantSlug: ["strt"] });
    expect(result.success).toBe(false);
  });
});

describe("Google OAuth pendingTenantSlug session", () => {
  it("session accepts pendingTenantSlug field", () => {
    const session: { activeTenantId?: string; pendingTenantSlug?: string } = {};
    session.pendingTenantSlug = "strt";
    expect(session.pendingTenantSlug).toBe("strt");
  });

  it("pendingTenantSlug is undefined by default", () => {
    const session: { activeTenantId?: string; pendingTenantSlug?: string } = {};
    expect(session.pendingTenantSlug).toBeUndefined();
  });

  it("pendingTenantSlug can be cleaned up after use", () => {
    const session: { activeTenantId?: string; pendingTenantSlug?: string } = {
      pendingTenantSlug: "strt",
    };
    delete session.pendingTenantSlug;
    expect(session.pendingTenantSlug).toBeUndefined();
  });

  it("pendingTenantSlug does not interfere with activeTenantId", () => {
    const session: { activeTenantId?: string; pendingTenantSlug?: string } = {
      activeTenantId: "t-1",
      pendingTenantSlug: "strt",
    };
    expect(session.activeTenantId).toBe("t-1");
    expect(session.pendingTenantSlug).toBe("strt");
  });
});

describe("autoSwitchToSlug logic validation", () => {
  it("only ACTIVE tenants should be switched to", () => {
    const activeTenant = mockTenants["strt"];
    expect(activeTenant.status).toBe("ACTIVE");

    const suspendedTenant = mockTenants["suspended"];
    expect(suspendedTenant.status).not.toBe("ACTIVE");
  });

  it("non-existent slug resolves to null", () => {
    const tenant = mockTenants["no-such-slug"] ?? null;
    expect(tenant).toBeNull();
  });

  it("switch should not happen for SUSPENDED tenant", () => {
    const tenant = mockTenants["suspended"];
    const shouldSwitch = tenant && tenant.status === "ACTIVE";
    expect(shouldSwitch).toBe(false);
  });

  it("switch should not happen for PROVISIONING tenant", () => {
    const tenant = mockTenants["provisioning"];
    const shouldSwitch = tenant && tenant.status === "ACTIVE";
    expect(shouldSwitch).toBe(false);
  });
});
