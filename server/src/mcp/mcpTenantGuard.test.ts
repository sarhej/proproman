import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runWithTenant, type TenantContext } from "../tenant/tenantContext.js";

const {
  mockResolveMcpTenantContext,
  mockInitiativeCreate,
  mockFeatureCreate,
  mockLoadMcpOAuthClients,
  mockHandleGoogleCallback,
} = vi.hoisted(() => ({
  mockResolveMcpTenantContext: vi.fn(),
  mockInitiativeCreate: vi.fn(),
  mockFeatureCreate: vi.fn(),
  mockLoadMcpOAuthClients: vi.fn().mockResolvedValue(undefined),
  mockHandleGoogleCallback: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/server/auth/router.js", () => ({
  mcpAuthRouter: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock("@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js", () => ({
  requireBearerAuth: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock("./oauth-provider.js", () => ({
  TymioOAuthProvider: class {
    async verifyAccessToken() {
      return {
        token: "tok",
        clientId: "client",
        scopes: [],
        extra: { userId: "caller", role: "ADMIN" },
      };
    }
  },
  handleGoogleCallback: mockHandleGoogleCallback,
  getMcpBaseUrl: () => "http://localhost:8080",
  loadMcpOAuthClients: mockLoadMcpOAuthClients,
}));

vi.mock("./resolveMcpTenantContext.js", () => ({
  resolveMcpTenantContext: mockResolveMcpTenantContext,
}));

vi.mock("../db.js", () => ({
  prisma: {
    initiative: {
      create: mockInitiativeCreate,
      update: vi.fn(),
    },
    feature: {
      create: mockFeatureCreate,
      update: vi.fn(),
    },
  },
}));

import { mountMcp } from "./setup.js";
import { registerTools } from "./tools.js";

function createToolRegistry() {
  const tools = new Map<string, (args: unknown, ctx: unknown) => Promise<unknown>>();
  const server = {
    registerTool(name: string, _meta: unknown, handler: (args: unknown, ctx: unknown) => Promise<unknown>) {
      tools.set(name, handler);
    },
  } as unknown as McpServer;
  registerTools(server);
  return tools;
}

const tenantContext: TenantContext = {
  tenantId: "t1",
  tenantSlug: "demo",
  schemaName: "tenant_demo",
  membershipRole: "ADMIN",
};

describe("MCP tenant guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 from /mcp when authenticated user has no active workspace membership", async () => {
    const app = express();
    app.use(express.json());
    mockResolveMcpTenantContext.mockResolvedValue(undefined);
    mountMcp(app);

    const res = await request(app)
      .post("/mcp")
      .set("Authorization", "Bearer token")
      .send({ jsonrpc: "2.0", id: "1", method: "tools/list" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("No active workspace membership");
  });

  it("rejects cross-user initiative ownership via MCP", async () => {
    const tools = createToolRegistry();
    const createInitiative = tools.get("drd_create_initiative");

    expect(createInitiative).toBeDefined();

    await expect(
      runWithTenant(tenantContext, () =>
        createInitiative!(
          { title: "Founding Provider Programme", domainId: "d1", ownerId: "other-user" },
          { authInfo: { extra: { userId: "caller", role: "ADMIN" } } }
        )
      )
    ).rejects.toThrow("ownerId must match the authenticated user");

    expect(mockInitiativeCreate).not.toHaveBeenCalled();
  });

  it("rejects cross-user feature ownership via MCP", async () => {
    const tools = createToolRegistry();
    const createFeature = tools.get("drd_create_feature");

    expect(createFeature).toBeDefined();

    await expect(
      runWithTenant(tenantContext, () =>
        createFeature!(
          { initiativeId: "i1", title: "Feature", ownerId: "other-user" },
          { authInfo: { extra: { userId: "caller", role: "ADMIN" } } }
        )
      )
    ).rejects.toThrow("ownerId must match the authenticated user");

    expect(mockFeatureCreate).not.toHaveBeenCalled();
  });
});
