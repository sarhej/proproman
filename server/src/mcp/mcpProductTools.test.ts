import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { UserRole } from "@prisma/client";
import { runWithTenant, type TenantContext } from "../tenant/tenantContext.js";

const mocks = vi.hoisted(() => ({
  productFindFirst: vi.fn(),
  productFindUnique: vi.fn(),
  productCreate: vi.fn(),
  productUpdate: vi.fn()
}));

vi.mock("../lib/mcpFeedbackNotice.js", () => ({
  appendMcpFeedbackToToolResult: (t: string) => t,
}));

vi.mock("../lib/codingAgentGuide.js", () => ({
  readCodingAgentGuide: vi.fn().mockResolvedValue("# guide"),
}));

vi.mock("../services/ontologyBrief.js", () => ({
  loadCapabilitiesForBrief: vi.fn().mockResolvedValue([]),
  compileBriefMarkdown: vi.fn(() => ({ content: "# md" })),
  compileBriefJson: vi.fn(() => ({ content: "{}" })),
}));

vi.mock("../db.js", () => ({
  prisma: {
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: mocks.productFindFirst,
      findUnique: mocks.productFindUnique,
      create: mocks.productCreate,
      update: mocks.productUpdate,
    },
    domain: { findMany: vi.fn().mockResolvedValue([]) },
    persona: { findMany: vi.fn().mockResolvedValue([]) },
    revenueStream: { findMany: vi.fn().mockResolvedValue([]) },
    account: { findMany: vi.fn().mockResolvedValue([]) },
    partner: { findMany: vi.fn().mockResolvedValue([]) },
    tenantMembership: { findMany: vi.fn().mockResolvedValue([]) },
    initiative: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    feature: { create: vi.fn(), update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    requirement: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    capability: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
  },
}));

import { registerTools } from "./tools.js";

function toolMap() {
  const tools = new Map<string, (args: unknown, ctx: unknown) => Promise<unknown>>();
  const server = {
    registerTool(name: string, _meta: unknown, handler: (args: unknown, ctx: unknown) => Promise<unknown>) {
      tools.set(name, handler);
    },
  } as unknown as McpServer;
  registerTools(server);
  return tools;
}

function ctx(userId: string, globalRole: string) {
  return { authInfo: { extra: { userId, role: globalRole } } };
}

const tenantCtx: TenantContext = {
  tenantId: "t-ws",
  tenantSlug: "ws",
  schemaName: "tenant_ws",
  membershipRole: "OWNER",
};

function parseText(result: unknown): string {
  const r = result as { content: Array<{ text?: string }> };
  return r.content[0]?.text ?? "";
}

describe("MCP product tools (slug + structure write)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productFindFirst.mockResolvedValue(null);
  });

  it("drd_create_product allocates slug and persists name", async () => {
    mocks.productCreate.mockResolvedValue({
      id: "p-new",
      name: "Line A",
      slug: "line-a",
      description: null,
      sortOrder: 0,
      itemType: "PRODUCT",
    });

    const tools = toolMap();
    const fn = tools.get("drd_create_product")!;

    await runWithTenant(tenantCtx, () =>
      fn({ workspaceSlug: "ws", name: "Line A" }, ctx("u1", UserRole.ADMIN))
    );

    expect(mocks.productCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Line A",
        slug: "line-a",
      }),
    });
  });

  it("drd_create_product uses explicit slug when free", async () => {
    mocks.productCreate.mockResolvedValue({
      id: "p2",
      name: "B",
      slug: "custom-slug",
      description: null,
      sortOrder: 0,
      itemType: "PRODUCT",
    });

    const tools = toolMap();
    const fn = tools.get("drd_create_product")!;

    await runWithTenant(tenantCtx, () =>
      fn({ workspaceSlug: "ws", name: "B", slug: "custom-slug" }, ctx("u1", UserRole.ADMIN))
    );

    expect(mocks.productCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ slug: "custom-slug" }),
    });
  });

  it("drd_update_product rejects duplicate slug in workspace", async () => {
    mocks.productFindUnique.mockResolvedValue({
      id: "p1",
      name: "A",
      slug: "a",
      sortOrder: 0,
    });
    mocks.productFindFirst.mockResolvedValueOnce({ id: "p-other" });

    const tools = toolMap();
    const fn = tools.get("drd_update_product")!;

    await expect(
      runWithTenant(tenantCtx, () =>
        fn({ workspaceSlug: "ws", id: "p1", slug: "taken" }, ctx("u1", UserRole.ADMIN))
      )
    ).rejects.toThrow(/slug already in use/i);

    expect(mocks.productUpdate).not.toHaveBeenCalled();
  });

  it("drd_update_product applies slug when unique", async () => {
    mocks.productFindUnique.mockResolvedValue({
      id: "p1",
      name: "A",
      slug: "a",
      sortOrder: 0,
    });
    mocks.productFindFirst.mockResolvedValueOnce(null);
    mocks.productUpdate.mockResolvedValue({
      id: "p1",
      name: "A",
      slug: "a2",
      sortOrder: 0,
    });

    const tools = toolMap();
    const fn = tools.get("drd_update_product")!;

    const out = await runWithTenant(tenantCtx, () =>
      fn({ workspaceSlug: "ws", id: "p1", slug: "a2" }, ctx("u1", UserRole.ADMIN))
    );

    expect(mocks.productUpdate).toHaveBeenCalled();
    expect(JSON.parse(parseText(out)).slug).toBe("a2");
  });
});
