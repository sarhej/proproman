import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { tenantRequestLookupBySlugHandler } from "./tenant-requests.js";

vi.mock("../db.js", () => ({
  prisma: {},
  prismaUnscoped: {
    tenantRequest: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));

import { prismaUnscoped } from "../db.js";

const mockReq = prismaUnscoped.tenantRequest as unknown as { findFirst: ReturnType<typeof vi.fn> };
const mockTenant = prismaUnscoped.tenant as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
};

describe("GET /api/tenant-requests/lookup-by-slug/:slug", () => {
  const app = express();
  app.get("/api/tenant-requests/lookup-by-slug/:slug", tenantRequestLookupBySlugHandler);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correlation payload", async () => {
    mockReq.findFirst.mockResolvedValue({
      id: "req1",
      status: "APPROVED",
      slug: "nakamapi",
      tenantId: "t1",
      teamName: "Nakam API",
      reviewNote: null,
    });
    mockTenant.findUnique.mockResolvedValue({
      id: "t1",
      slug: "nakamapi",
      status: "PROVISIONING",
      name: "Nakam API",
    });
    mockTenant.findFirst.mockResolvedValue(null);

    const res = await request(app).get("/api/tenant-requests/lookup-by-slug/nakamapi");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      normalizedSlug: "nakamapi",
      registrationRequest: {
        id: "req1",
        status: "APPROVED",
        slug: "nakamapi",
        tenantId: "t1",
        teamName: "Nakam API",
        reviewNote: null,
      },
      linkedTenant: { id: "t1", slug: "nakamapi", status: "PROVISIONING", name: "Nakam API" },
      activeTenantBySlug: null,
    });
  });

  it("rejects empty slug", async () => {
    const res = await request(app).get("/api/tenant-requests/lookup-by-slug/%20%20");

    expect(res.status).toBe(400);
  });
});
