import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTenantFindFirst = vi.hoisted(() => vi.fn());
const mockLoadMcpOAuthClients = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@modelcontextprotocol/sdk/server/auth/router.js", () => ({
  mcpAuthRouter: () => (_req: unknown, _res: unknown, next: () => void) => next()
}));

vi.mock("@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js", () => ({
  requireBearerAuth: () => (_req: unknown, _res: unknown, next: () => void) => next()
}));

vi.mock("./oauth-provider.js", () => ({
  TymioOAuthProvider: class {
    async verifyAccessToken() {
      return {
        token: "tok",
        clientId: "client",
        scopes: [],
        extra: { userId: "u1", role: "ADMIN" }
      };
    }
  },
  handleGoogleCallback: vi.fn(),
  getMcpBaseUrl: () => "http://localhost:8080",
  loadMcpOAuthClients: mockLoadMcpOAuthClients
}));

vi.mock("../db.js", () => ({
  prisma: {},
  prismaUnscoped: {
    tenant: { findFirst: mockTenantFindFirst }
  }
}));

import { mountMcp } from "./setup.js";

describe("workspace MCP HTTP when tenant missing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantFindFirst.mockResolvedValue(null);
  });

  it("returns 403 JSON when workspace slug does not exist", async () => {
    const app = express();
    mountMcp(app);

    const res = await request(app)
      .post("/t/no-such-workspace/mcp")
      .set("Authorization", "Bearer fake.jwt")
      .send({ jsonrpc: "2.0", method: "initialize", id: 1 });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: expect.stringMatching(/No access to this workspace|workspace not found/i)
    });
    expect(mockTenantFindFirst).toHaveBeenCalled();
  });
});
