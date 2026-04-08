import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { UserRole } from "@prisma/client";
import { runWithTenant, type TenantContext } from "../tenant/tenantContext.js";

const mocks = vi.hoisted(() => ({
  canUserEditInitiativeForMcp: vi.fn().mockResolvedValue(true),
  applyExecutionColumn: vi.fn().mockResolvedValue({ executionColumnId: "col1" }),
  initiativeUpdate: vi.fn().mockResolvedValue({}),
  initiativeFindUnique: vi.fn(),
  featureFindUnique: vi.fn(),
  featureAggregate: vi.fn(),
  featureUpdate: vi.fn(),
  initiativeFindMany: vi.fn(),
  featureFindMany: vi.fn(),
  requirementFindMany: vi.fn(),
  requirementUpdate: vi.fn().mockResolvedValue({}),
  executionBoardFindMany: vi.fn(),
  productFindUnique: vi.fn(),
  $transaction: vi.fn((arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
    if (typeof arg === "function") return (arg as () => Promise<unknown>)();
    return Promise.resolve();
  })
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

vi.mock("../lib/initiativeMcpPermission.js", () => ({
  canUserEditInitiativeForMcp: mocks.canUserEditInitiativeForMcp,
}));

vi.mock("../services/requirementExecutionColumn.js", () => ({
  applyExecutionColumn: mocks.applyExecutionColumn,
}));

vi.mock("../db.js", () => ({
  prisma: {
    initiative: {
      findMany: mocks.initiativeFindMany,
      findUnique: mocks.initiativeFindUnique,
      update: mocks.initiativeUpdate,
    },
    feature: {
      findUnique: mocks.featureFindUnique,
      findMany: mocks.featureFindMany,
      aggregate: mocks.featureAggregate,
      update: mocks.featureUpdate,
    },
    requirement: {
      findMany: mocks.requirementFindMany,
      update: mocks.requirementUpdate,
    },
    executionBoard: {
      findMany: mocks.executionBoardFindMany,
    },
    product: {
      findUnique: mocks.productFindUnique,
    },
    $transaction: mocks.$transaction,
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

function ctx(userId: string, globalRole: string) {
  return { authInfo: { extra: { userId, role: globalRole } } };
}

function tenant(membershipRole: TenantContext["membershipRole"]): TenantContext {
  return {
    tenantId: "t-ws",
    tenantSlug: "ws",
    schemaName: "tenant_ws",
    membershipRole,
  };
}

describe("MCP Tier 2 — initiative reorder + permission gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canUserEditInitiativeForMcp.mockResolvedValue(true);
  });

  it("does not run transaction when canUserEditInitiativeForMcp is false", async () => {
    mocks.canUserEditInitiativeForMcp.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const tools = createToolRegistry();
    const reorder = tools.get("drd_reorder_initiatives");
    await expect(
      runWithTenant(tenant("MEMBER"), () =>
        reorder!(
          {
            workspaceSlug: "ws",
            positions: [
              { id: "i1", domainId: "d1", sortOrder: 0 },
              { id: "i2", domainId: "d1", sortOrder: 1 },
            ],
          },
          ctx("u1", UserRole.EDITOR)
        )
      )
    ).rejects.toThrow(/cannot reorder or move initiative i2/);
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it("runs transaction when all initiatives are editable", async () => {
    const tools = createToolRegistry();
    const reorder = tools.get("drd_reorder_initiatives");
    await runWithTenant(tenant("MEMBER"), () =>
      reorder!(
        { workspaceSlug: "ws", positions: [{ id: "i1", domainId: "d1", sortOrder: 2 }] },
        ctx("u1", UserRole.EDITOR)
      )
    );
    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.initiativeUpdate).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { domainId: "d1", sortOrder: 2 },
    });
  });
});

describe("MCP Tier 2 — search pagination (hasMore)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drd_search_initiatives sets hasMore when more than limit rows exist", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({
      id: `init-${i}`,
      title: `T${i}`,
      description: null,
      domain: { id: "d1", name: "Dom" },
      product: { id: "p1", name: "Prod", slug: "prod" },
      owner: null,
    }));
    mocks.initiativeFindMany.mockResolvedValueOnce(rows);
    const tools = createToolRegistry();
    const search = tools.get("drd_search_initiatives");
    const result = await runWithTenant(tenant("MEMBER"), () =>
      search!({ workspaceSlug: "ws", query: "T", limit: 3, offset: 0 }, ctx("u1", UserRole.EDITOR))
    );
    const text = (result as { content: Array<{ text?: string }> }).content[0]?.text;
    const payload = JSON.parse(text!) as { items: unknown[]; hasMore: boolean; limit: number };
    expect(payload.items).toHaveLength(3);
    expect(payload.hasMore).toBe(true);
    expect(payload.limit).toBe(3);
    expect(mocks.initiativeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 4, skip: 0 })
    );
  });
});

describe("MCP Tier 2 — drd_move_feature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canUserEditInitiativeForMcp.mockResolvedValue(true);
  });

  it("rejects when productId does not match between source initiative and target", async () => {
    mocks.featureFindUnique.mockResolvedValueOnce({
      id: "f1",
      initiativeId: "i-src",
      initiative: { id: "i-src", productId: "p-a" },
    });
    mocks.initiativeFindUnique.mockResolvedValueOnce({ id: "i-tgt", productId: "p-b" });
    const tools = createToolRegistry();
    const move = tools.get("drd_move_feature");
    await expect(
      runWithTenant(tenant("MEMBER"), () =>
        move!(
          { workspaceSlug: "ws", featureId: "f1", targetInitiativeId: "i-tgt" },
          ctx("u1", UserRole.EDITOR)
        )
      )
    ).rejects.toThrow(/same product/);
    expect(mocks.featureUpdate).not.toHaveBeenCalled();
  });

  it("updates initiativeId and appends sortOrder when omitted", async () => {
    mocks.featureFindUnique.mockResolvedValueOnce({
      id: "f1",
      initiativeId: "i-src",
      initiative: { id: "i-src", productId: "p1" },
    });
    mocks.initiativeFindUnique.mockResolvedValueOnce({ id: "i-tgt", productId: "p1" });
    mocks.featureAggregate.mockResolvedValueOnce({ _max: { sortOrder: 5 } });
    mocks.featureUpdate.mockResolvedValueOnce({
      id: "f1",
      title: "Moved",
      initiativeId: "i-tgt",
      owner: null,
      initiative: { id: "i-tgt", title: "Target" },
    });
    const tools = createToolRegistry();
    const move = tools.get("drd_move_feature");
    await runWithTenant(tenant("MEMBER"), () =>
      move!(
        { workspaceSlug: "ws", featureId: "f1", targetInitiativeId: "i-tgt" },
        ctx("u1", UserRole.EDITOR)
      )
    );
    expect(mocks.featureUpdate).toHaveBeenCalledWith({
      where: { id: "f1" },
      data: { initiativeId: "i-tgt", sortOrder: 6 },
      include: { initiative: { select: { id: true, title: true } }, owner: true },
    });
  });

  it("rejects when cannot edit source initiative", async () => {
    mocks.featureFindUnique.mockResolvedValueOnce({
      id: "f1",
      initiativeId: "i-src",
      initiative: { id: "i-src", productId: null },
    });
    mocks.initiativeFindUnique.mockResolvedValueOnce({ id: "i-tgt", productId: null });
    mocks.canUserEditInitiativeForMcp.mockResolvedValueOnce(false);
    const tools = createToolRegistry();
    const move = tools.get("drd_move_feature");
    await expect(
      runWithTenant(tenant("MEMBER"), () =>
        move!(
          { workspaceSlug: "ws", featureId: "f1", targetInitiativeId: "i-tgt" },
          ctx("u1", UserRole.EDITOR)
        )
      )
    ).rejects.toThrow(/cannot move feature from initiative i-src/);
    expect(mocks.featureUpdate).not.toHaveBeenCalled();
  });

  it("rejects when cannot edit target initiative", async () => {
    mocks.featureFindUnique.mockResolvedValueOnce({
      id: "f1",
      initiativeId: "i-src",
      initiative: { id: "i-src", productId: null },
    });
    mocks.initiativeFindUnique.mockResolvedValueOnce({ id: "i-tgt", productId: null });
    mocks.canUserEditInitiativeForMcp.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const tools = createToolRegistry();
    const move = tools.get("drd_move_feature");
    await expect(
      runWithTenant(tenant("MEMBER"), () =>
        move!(
          { workspaceSlug: "ws", featureId: "f1", targetInitiativeId: "i-tgt" },
          ctx("u1", UserRole.EDITOR)
        )
      )
    ).rejects.toThrow(/cannot move feature to initiative i-tgt/);
    expect(mocks.featureUpdate).not.toHaveBeenCalled();
  });
});

describe("MCP Tier 2 — drd_set_execution_layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyExecutionColumn.mockResolvedValue({ executionColumnId: "col1" });
  });

  it("rejects duplicate requirement ids before touching boards", async () => {
    const tools = createToolRegistry();
    const layout = tools.get("drd_set_execution_layout");
    await expect(
      runWithTenant(tenant("MEMBER"), () =>
        layout!(
          {
            workspaceSlug: "ws",
            productId: "p1",
            columns: [{ executionColumnId: null, requirementIds: ["r1", "r1"] }],
          },
          ctx("u1", UserRole.EDITOR)
        )
      )
    ).rejects.toThrow(/Duplicate requirement ids in layout/);
    expect(mocks.executionBoardFindMany).not.toHaveBeenCalled();
  });

  it("rejects unknown execution column for product", async () => {
    mocks.executionBoardFindMany.mockResolvedValueOnce([{ columns: [{ id: "col1" }] }]);
    const tools = createToolRegistry();
    const layout = tools.get("drd_set_execution_layout");
    await expect(
      runWithTenant(tenant("MEMBER"), () =>
        layout!(
          {
            workspaceSlug: "ws",
            productId: "p1",
            columns: [{ executionColumnId: "unknown-col", requirementIds: ["r1"] }],
          },
          ctx("u1", UserRole.EDITOR)
        )
      )
    ).rejects.toThrow(/Unknown execution column/);
    expect(mocks.requirementFindMany).not.toHaveBeenCalled();
  });

  it("calls applyExecutionColumn when moving a requirement into a column", async () => {
    mocks.executionBoardFindMany.mockResolvedValueOnce([{ columns: [{ id: "col1" }] }]);
    mocks.requirementFindMany.mockResolvedValueOnce([
      { id: "r1", featureId: "f1", executionColumnId: null },
    ]);
    const tools = createToolRegistry();
    const layout = tools.get("drd_set_execution_layout");
    await runWithTenant(tenant("MEMBER"), () =>
      layout!(
        {
          workspaceSlug: "ws",
          productId: "p1",
          columns: [{ executionColumnId: "col1", requirementIds: ["r1"] }],
        },
        ctx("u1", UserRole.EDITOR)
      )
    );
    expect(mocks.applyExecutionColumn).toHaveBeenCalledWith("f1", "col1");
    expect(mocks.requirementUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { executionSortOrder: 0, executionColumnId: "col1" },
    });
    expect(mocks.$transaction).toHaveBeenCalled();
  });

  it("does not call applyExecutionColumn when column unchanged", async () => {
    mocks.executionBoardFindMany.mockResolvedValueOnce([{ columns: [{ id: "col1" }] }]);
    mocks.requirementFindMany.mockResolvedValueOnce([
      { id: "r1", featureId: "f1", executionColumnId: "col1" },
    ]);
    const tools = createToolRegistry();
    const layout = tools.get("drd_set_execution_layout");
    await runWithTenant(tenant("MEMBER"), () =>
      layout!(
        {
          workspaceSlug: "ws",
          productId: "p1",
          columns: [{ executionColumnId: "col1", requirementIds: ["r1"] }],
        },
        ctx("u1", UserRole.EDITOR)
      )
    );
    expect(mocks.applyExecutionColumn).not.toHaveBeenCalled();
    expect(mocks.requirementUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { executionSortOrder: 0 },
    });
  });
});

describe("MCP Tier 2 — drd_create_execution_board (OWNER / ADMIN)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productFindUnique.mockResolvedValue({ id: "p1", name: "Prod" });
  });

  it.each([
    ["OWNER", "OWNER"] as const,
    ["ADMIN", "ADMIN"] as const,
  ])("%s creates board via transaction", async (_label, membership) => {
    const createdBoard = {
      id: "board-1",
      productId: "p1",
      name: "Sprint",
      provider: "INTERNAL",
      isDefault: true,
      externalRef: null,
      config: null,
      columns: [
        { id: "c0", isDefault: true, name: "Backlog", sortOrder: 0, mappedStatus: "NOT_STARTED" },
        { id: "c1", isDefault: false, name: "In progress", sortOrder: 1, mappedStatus: "IN_PROGRESS" },
        { id: "c2", isDefault: false, name: "Testing", sortOrder: 2, mappedStatus: "TESTING" },
        { id: "c3", isDefault: false, name: "Done", sortOrder: 3, mappedStatus: "DONE" },
      ],
    };
    const txStub = {
      executionBoard: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue(createdBoard),
      },
      executionColumn: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    mocks.$transaction.mockImplementationOnce(async (fn: unknown) =>
      (fn as (tx: typeof txStub) => Promise<unknown>)(txStub)
    );
    const tools = createToolRegistry();
    const createBoard = tools.get("drd_create_execution_board");
    const result = await runWithTenant(tenant(membership), () =>
      createBoard!(
        { workspaceSlug: "ws", productId: "p1", name: "Sprint" },
        ctx("u1", UserRole.VIEWER)
      )
    );
    const text = (result as { content: Array<{ text?: string }> }).content[0]?.text;
    const board = JSON.parse(text!) as { id: string; name: string; columns: { id: string }[] };
    expect(board.id).toBe("board-1");
    expect(board.name).toBe("Sprint");
    expect(board.columns).toHaveLength(4);
    expect(txStub.executionBoard.updateMany).toHaveBeenCalled();
    expect(txStub.executionBoard.create).toHaveBeenCalled();
    expect(txStub.executionColumn.updateMany).toHaveBeenCalled();
  });
});
