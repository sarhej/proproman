import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";
import type { TenantContext } from "../tenant/tenantContext.js";
import {
  requireWorkspaceContentWrite,
  requireWorkspaceStructureWrite,
  requireTenantCampaignWrite,
} from "./workspaceAuth.js";

function attachUserAndTenant(
  userOverrides: Partial<Express.User> | null,
  tenantContext: TenantContext | null
) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    if (userOverrides === null) {
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
      next();
      return;
    }
    const defaultUser: Express.User = {
      id: "u1",
      email: "u1@test.local",
      name: "Test",
      role: UserRole.EDITOR,
      isActive: true,
      activeTenantId: "t1",
      ...userOverrides,
    } as Express.User;
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: Express.User }).user = defaultUser;
    if (tenantContext) {
      (req as unknown as { tenantContext: TenantContext }).tenantContext = tenantContext;
    }
    next();
  };
}

function makeApp(
  middleware: express.RequestHandler,
  opts: { user?: Partial<Express.User> | null; tenant?: TenantContext | null } = {}
) {
  const app = express();
  const { user = {}, tenant = null } = opts;
  app.use(attachUserAndTenant(user === null ? null : user, tenant));
  app.use(middleware);
  app.get("/test", (_req, res) => res.json({ ok: true }));
  return app;
}

const tenant = (role: TenantContext["membershipRole"]): TenantContext => ({
  tenantId: "t1",
  tenantSlug: "acme",
  schemaName: "tenant_acme",
  membershipRole: role,
});

describe("requireWorkspaceContentWrite", () => {
  it.each([["MEMBER"], ["OWNER"], ["ADMIN"]] as const)(
    "allows workspace %s (content write)",
    async (membershipRole) => {
      const res = await request(
        makeApp(requireWorkspaceContentWrite(), { tenant: tenant(membershipRole) })
      ).get("/test");
      expect(res.status).toBe(200);
    }
  );

  it("global User.role is ignored when workspace allows (VIEWER global + workspace MEMBER)", async () => {
    const res = await request(
      makeApp(requireWorkspaceContentWrite(), {
        user: { role: UserRole.VIEWER },
        tenant: tenant("MEMBER"),
      })
    ).get("/test");
    expect(res.status).toBe(200);
  });

  it("rejects VIEWER with 403", async () => {
    const res = await request(makeApp(requireWorkspaceContentWrite(), { tenant: tenant("VIEWER") })).get("/test");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("returns 400 when tenant context is missing", async () => {
    const res = await request(
      makeApp(requireWorkspaceContentWrite(), { user: { role: UserRole.EDITOR }, tenant: null })
    ).get("/test");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Tenant context required");
  });

  it("allows SUPER_ADMIN without tenant context", async () => {
    const res = await request(
      makeApp(requireWorkspaceContentWrite(), { user: { role: UserRole.SUPER_ADMIN }, tenant: null })
    ).get("/test");
    expect(res.status).toBe(200);
  });

  it("rejects unauthenticated with 401", async () => {
    const res = await request(makeApp(requireWorkspaceContentWrite(), { user: null, tenant: tenant("MEMBER") })).get(
      "/test"
    );
    expect(res.status).toBe(401);
  });
});

describe("requireWorkspaceStructureWrite", () => {
  it.each([["OWNER"], ["ADMIN"]] as const)("allows workspace %s", async (membershipRole) => {
    const res = await request(
      makeApp(requireWorkspaceStructureWrite(), { tenant: tenant(membershipRole) })
    ).get("/test");
    expect(res.status).toBe(200);
  });

  it("allows workspace ADMIN even when global role is VIEWER", async () => {
    const res = await request(
      makeApp(requireWorkspaceStructureWrite(), {
        user: { role: UserRole.VIEWER },
        tenant: tenant("ADMIN"),
      })
    ).get("/test");
    expect(res.status).toBe(200);
  });

  it("rejects workspace VIEWER even when global role is ADMIN", async () => {
    const res = await request(
      makeApp(requireWorkspaceStructureWrite(), {
        user: { role: UserRole.ADMIN },
        tenant: tenant("VIEWER"),
      })
    ).get("/test");
    expect(res.status).toBe(403);
  });

  it.each([["MEMBER"], ["VIEWER"]] as const)("rejects workspace %s with 403", async (membershipRole) => {
    const res = await request(
      makeApp(requireWorkspaceStructureWrite(), { tenant: tenant(membershipRole) })
    ).get("/test");
    expect(res.status).toBe(403);
  });

  it("allows SUPER_ADMIN without tenant", async () => {
    const res = await request(
      makeApp(requireWorkspaceStructureWrite(), { user: { role: UserRole.SUPER_ADMIN }, tenant: null })
    ).get("/test");
    expect(res.status).toBe(200);
  });
});

describe("requireTenantCampaignWrite", () => {
  it.each([
    ["MEMBER", UserRole.MARKETING],
    ["ADMIN", UserRole.MARKETING],
    ["OWNER", UserRole.ADMIN],
  ] as const)("allows when workspace %s and global %s", async (membership, globalRole) => {
    const res = await request(
      makeApp(requireTenantCampaignWrite(), {
        user: { role: globalRole },
        tenant: tenant(membership),
      })
    ).get("/test");
    expect(res.status).toBe(200);
  });

  it("rejects EDITOR even when workspace MEMBER", async () => {
    const res = await request(
      makeApp(requireTenantCampaignWrite(), {
        user: { role: UserRole.EDITOR },
        tenant: tenant("MEMBER"),
      })
    ).get("/test");
    expect(res.status).toBe(403);
  });

  it("rejects MARKETING when workspace is VIEWER", async () => {
    const res = await request(
      makeApp(requireTenantCampaignWrite(), {
        user: { role: UserRole.MARKETING },
        tenant: tenant("VIEWER"),
      })
    ).get("/test");
    expect(res.status).toBe(403);
  });
});
