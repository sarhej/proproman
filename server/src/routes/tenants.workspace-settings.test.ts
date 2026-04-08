import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";
import { tenantsRouter } from "./tenants.js";

vi.mock("../db.js", () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    uiSettings: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../db.js";

const mockTenant = prisma.tenant as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockUiSettings = prisma.uiSettings as unknown as { findUnique: ReturnType<typeof vi.fn> };

function authSuperAdmin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = {
      id: "sa1",
      email: "sa@test.local",
      name: "SA",
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      activeTenantId: null,
    } as Express.User;
    next();
  };
}

vi.mock("../services/audit.js", () => ({
  logAudit: vi.fn(),
}));

describe("tenant workspace-settings (SUPER_ADMIN)", () => {
  const app = express();
  app.use(express.json());
  app.use(authSuperAdmin());
  app.use("/api/tenants", tenantsRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns merged nav + locales for a tenant", async () => {
    mockTenant.findUnique.mockResolvedValue({
      id: "t1",
      settings: { enabledLocales: ["en", "pl"], hiddenNavPaths: ["/gantt"] },
    });
    mockUiSettings.findUnique.mockResolvedValue({ hiddenNavPaths: ["/heatmap"] });

    const res = await request(app).get("/api/tenants/t1/workspace-settings");

    expect(res.status).toBe(200);
    expect(res.body.enabledLocales).toEqual(["en", "pl"]);
    expect(res.body.globalHiddenNavPaths).toEqual(["/heatmap"]);
    expect(res.body.tenantHiddenNavPaths).toEqual(["/gantt"]);
    expect(res.body.hiddenNavPaths).toEqual(expect.arrayContaining(["/heatmap", "/gantt"]));
    expect(Array.isArray(res.body.managedNavPaths)).toBe(true);
    expect(res.body.managedNavPaths.length).toBeGreaterThan(0);
  });

  it("PATCH languages updates tenant settings JSON", async () => {
    mockTenant.findUnique.mockResolvedValue({
      id: "t1",
      settings: { other: true },
    });
    mockTenant.update.mockResolvedValue({ id: "t1" });

    const res = await request(app)
      .patch("/api/tenants/t1/workspace-settings/languages")
      .send({ enabledLocales: ["en", "cs"] });

    expect(res.status).toBe(200);
    expect(res.body.enabledLocales).toEqual(["en", "cs"]);
    expect(mockTenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        settings: { other: true, enabledLocales: ["en", "cs"] },
      },
    });
  });

  it("PUT nav-visibility persists tenant hidden paths", async () => {
    mockTenant.findUnique
      .mockResolvedValueOnce({ id: "t1" })
      .mockResolvedValueOnce({ settings: {} });
    mockUiSettings.findUnique.mockResolvedValue({ hiddenNavPaths: [] });
    mockTenant.update.mockResolvedValue({ id: "t1" });

    const res = await request(app)
      .put("/api/tenants/t1/workspace-settings/nav-visibility")
      .send({ hiddenNavPaths: ["/gantt"] });

    expect(res.status).toBe(200);
    expect(res.body.tenantHiddenNavPaths).toEqual(["/gantt"]);
    expect(mockTenant.update).toHaveBeenCalled();
  });
});
