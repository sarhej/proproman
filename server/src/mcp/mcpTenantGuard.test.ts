import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runWithTenant, type TenantContext } from "../tenant/tenantContext.js";

const {
  mockInitiativeCreate,
  mockFeatureCreate,
  mockLoadMcpOAuthClients,
  mockHandleGoogleCallback,
  mockTenantMembershipFindMany,
} = vi.hoisted(() => ({
  mockInitiativeCreate: vi.fn(),
  mockFeatureCreate: vi.fn(),
  mockLoadMcpOAuthClients: vi.fn().mockResolvedValue(undefined),
  mockHandleGoogleCallback: vi.fn(),
  mockTenantMembershipFindMany: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/server/auth/router.js", () => ({
  mcpAuthRouter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js", () => ({
  requireBearerAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
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

vi.mock("../db.js", () => ({
  prisma: {
    tenantMembership: {
      findMany: mockTenantMembershipFindMany,
    },
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

/** MEMBER cannot assign initiative/feature owner to another user without matching caller. */
const tenantContext: TenantContext = {
  tenantId: "t1",
  tenantSlug: "demo",
  schemaName: "tenant_demo",
  membershipRole: "MEMBER",
};

describe("MCP tenant guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantMembershipFindMany.mockImplementation(
      async (args: { where: { userId: { in: string[] } } }) =>
        args.where.userId.in.map((userId: string) => ({ userId }))
    );
  });

  it("rejects cross-user initiative ownership via MCP", async () => {
    const tools = createToolRegistry();
    const createInitiative = tools.get("drd_create_initiative");

    expect(createInitiative).toBeDefined();

    await expect(
      runWithTenant(tenantContext, () =>
        createInitiative!(
          {
            workspaceSlug: "demo",
            title: "Founding Provider Programme",
            domainId: "d1",
            ownerId: "other-user",
          },
          { authInfo: { extra: { userId: "caller", role: "ADMIN" } } }
        )
      )
    ).rejects.toThrow("ownerId must match the authenticated user unless you are workspace OWNER or ADMIN");

    expect(mockInitiativeCreate).not.toHaveBeenCalled();
  });

  it("rejects cross-user feature ownership via MCP", async () => {
    const tools = createToolRegistry();
    const createFeature = tools.get("drd_create_feature");

    expect(createFeature).toBeDefined();

    await expect(
      runWithTenant(tenantContext, () =>
        createFeature!(
          {
            workspaceSlug: "demo",
            initiativeId: "i1",
            title: "Feature",
            ownerId: "other-user",
          },
          { authInfo: { extra: { userId: "caller", role: "ADMIN" } } }
        )
      )
    ).rejects.toThrow("ownerId must match the authenticated user unless you are workspace OWNER or ADMIN");

    expect(mockFeatureCreate).not.toHaveBeenCalled();
  });

  it("rejects assignee outside workspace on requirement create", async () => {
    mockTenantMembershipFindMany.mockResolvedValueOnce([{ userId: "caller" }]);
    const tools = createToolRegistry();
    const createReq = tools.get("drd_create_requirement");
    await expect(
      runWithTenant(tenantContext, () =>
        createReq!(
          {
            workspaceSlug: "demo",
            featureId: "f1",
            title: "Task",
            assigneeId: "stranger",
          },
          { authInfo: { extra: { userId: "caller", role: "EDITOR" } } }
        )
      )
    ).rejects.toThrow("not a member of this workspace");
  });
});
