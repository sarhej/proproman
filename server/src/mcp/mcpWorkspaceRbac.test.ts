import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { UserRole } from "@prisma/client";
import { runWithTenant, type TenantContext } from "../tenant/tenantContext.js";
import * as tenantUserRefs from "../lib/tenantUserRefs.js";

const mocks = vi.hoisted(() => ({
  domainFindMany: vi.fn().mockResolvedValue([]),
  personaFindMany: vi.fn().mockResolvedValue([]),
  revenueStreamFindMany: vi.fn().mockResolvedValue([]),
  productFindMany: vi.fn().mockResolvedValue([]),
  productFindFirst: vi.fn().mockResolvedValue(null),
  accountFindMany: vi.fn().mockResolvedValue([]),
  partnerFindMany: vi.fn().mockResolvedValue([]),
  tenantMembershipFindMany: vi.fn(),
  initiativeFindMany: vi.fn().mockResolvedValue([]),
  initiativeFindUnique: vi.fn().mockResolvedValue({ id: "i1", title: "I" }),
  initiativeCreate: vi.fn(),
  initiativeDelete: vi.fn(),
  initiativeUpdate: vi.fn().mockResolvedValue({ id: "i1", title: "Updated" }),
  productCreate: vi.fn(),
  featureCreate: vi.fn(),
  featureUpdate: vi.fn().mockResolvedValue({ id: "f1", title: "F" }),
  requirementCreate: vi.fn(),
  requirementUpdate: vi.fn(),
  requirementFindUnique: vi.fn(),
  requirementFindFirst: vi.fn(),
  capabilityFindMany: vi.fn().mockResolvedValue([{ id: "c1", slug: "cap-a", bindings: [] }]),
  capabilityFindUnique: vi.fn().mockResolvedValue({ id: "c1", slug: "cap-a", bindings: [] }),
}));

vi.mock("../lib/mcpFeedbackNotice.js", () => ({
  appendMcpFeedbackToToolResult: (t: string) => t,
}));

vi.mock("../lib/codingAgentGuide.js", () => ({
  readCodingAgentGuide: vi.fn().mockResolvedValue("# Coding agent guide"),
}));

vi.mock("../services/ontologyBrief.js", () => ({
  loadCapabilitiesForBrief: vi.fn().mockResolvedValue([]),
  compileBriefMarkdown: vi.fn(() => ({ content: "# brief md" })),
  compileBriefJson: vi.fn(() => ({ content: "{}" })),
}));

vi.mock("../db.js", () => ({
  prisma: {
    domain: { findMany: mocks.domainFindMany },
    persona: { findMany: mocks.personaFindMany },
    revenueStream: { findMany: mocks.revenueStreamFindMany },
    product: {
      findMany: mocks.productFindMany,
      findFirst: mocks.productFindFirst,
      create: mocks.productCreate,
    },
    account: { findMany: mocks.accountFindMany },
    partner: { findMany: mocks.partnerFindMany },
    tenantMembership: { findMany: mocks.tenantMembershipFindMany },
    initiative: {
      findMany: mocks.initiativeFindMany,
      findUnique: mocks.initiativeFindUnique,
      create: mocks.initiativeCreate,
      delete: mocks.initiativeDelete,
      update: mocks.initiativeUpdate,
    },
    feature: {
      create: mocks.featureCreate,
      update: mocks.featureUpdate,
      findMany: vi.fn().mockResolvedValue([]),
    },
    requirement: {
      create: mocks.requirementCreate,
      update: mocks.requirementUpdate,
      findUnique: mocks.requirementFindUnique,
      findFirst: mocks.requirementFindFirst,
    },
    capability: {
      findMany: mocks.capabilityFindMany,
      findUnique: mocks.capabilityFindUnique,
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

function parseMetaText(result: unknown): { users?: unknown[] } {
  const r = result as { content: Array<{ text?: string }> };
  const text = r.content[0]?.text;
  if (!text) throw new Error("missing text");
  return JSON.parse(text) as { users?: unknown[] };
}

function setupMembershipMock() {
  mocks.tenantMembershipFindMany.mockImplementation(
    async (args: { where: { userId: { in: string[] } } }) =>
      args.where.userId.in.map((userId: string) => ({ userId }))
  );
}

describe("MCP drd_meta tenant user list", () => {
  let listSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setupMembershipMock();
    listSpy = vi.spyOn(tenantUserRefs, "listTenantMemberUsersPublic").mockResolvedValue([
      { id: "u-a", name: "Alice", email: "a@tenant.local", role: "EDITOR" },
      { id: "u-b", name: "Bob", email: "b@tenant.local", role: "VIEWER" },
    ]);
  });

  it("loads users only via listTenantMemberUsersPublic for current tenant", async () => {
    const tools = createToolRegistry();
    const drdMeta = tools.get("drd_meta");
    const result = await runWithTenant(tenant("MEMBER"), () => drdMeta!({}, ctx("u-a", "EDITOR")));
    const payload = parseMetaText(result);
    expect(listSpy).toHaveBeenCalledWith("t-ws");
    expect(payload.users).toEqual([
      { id: "u-a", name: "Alice", email: "a@tenant.local", role: "EDITOR" },
      { id: "u-b", name: "Bob", email: "b@tenant.local", role: "VIEWER" },
    ]);
  });
});

describe("MCP workspace role matrix (writes)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMembershipMock();
  });

  it("VIEWER cannot create initiative", async () => {
    const tools = createToolRegistry();
    const createInitiative = tools.get("drd_create_initiative");
    await expect(
      runWithTenant(tenant("VIEWER"), () =>
        createInitiative!(
          { title: "X", domainId: "d1" },
          ctx("caller", "EDITOR")
        )
      )
    ).rejects.toThrow("workspace VIEWER cannot modify");
    expect(mocks.initiativeCreate).not.toHaveBeenCalled();
  });

  it("VIEWER can list domains (read)", async () => {
    mocks.domainFindMany.mockResolvedValueOnce([{ id: "d1", name: "Dom", sortOrder: 0, color: "#000" }]);
    const tools = createToolRegistry();
    const listDomains = tools.get("drd_list_domains");
    const result = await runWithTenant(tenant("VIEWER"), () => listDomains!({}, ctx("caller", "VIEWER")));
    const text = (result as { content: Array<{ text?: string }> }).content[0]?.text;
    expect(JSON.parse(text!)).toEqual([{ id: "d1", name: "Dom", sortOrder: 0, color: "#000" }]);
  });

  it("MEMBER cannot delete initiative (structure)", async () => {
    const tools = createToolRegistry();
    const del = tools.get("drd_delete_initiative");
    await expect(
      runWithTenant(tenant("MEMBER"), () => del!({ id: "i1" }, ctx("caller", "EDITOR")))
    ).rejects.toThrow("requires workspace OWNER or ADMIN");
    expect(mocks.initiativeDelete).not.toHaveBeenCalled();
  });

  it("MEMBER cannot create product (structure)", async () => {
    const tools = createToolRegistry();
    const createProduct = tools.get("drd_create_product");
    await expect(
      runWithTenant(tenant("MEMBER"), () =>
        createProduct!({ name: "P" }, ctx("caller", "EDITOR"))
      )
    ).rejects.toThrow("requires workspace OWNER or ADMIN");
    expect(mocks.productCreate).not.toHaveBeenCalled();
  });

  it("MEMBER can create initiative as self owner", async () => {
    mocks.initiativeCreate.mockResolvedValueOnce({ id: "new-i" });
    const tools = createToolRegistry();
    const createInitiative = tools.get("drd_create_initiative");
    await runWithTenant(tenant("MEMBER"), () =>
      createInitiative!(
        { title: "Roadmap", domainId: "d1" },
        ctx("caller", "EDITOR")
      )
    );
    expect(mocks.initiativeCreate).toHaveBeenCalled();
  });
});

describe("MCP matrix: global SUPER_ADMIN bypasses workspace VIEWER", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMembershipMock();
  });

  it("can create initiative despite workspace VIEWER when JWT role is SUPER_ADMIN", async () => {
    mocks.initiativeCreate.mockResolvedValueOnce({ id: "i-sa" });
    const tools = createToolRegistry();
    const createInitiative = tools.get("drd_create_initiative");
    await runWithTenant(tenant("VIEWER"), () =>
      createInitiative!(
        { title: "Admin path", domainId: "d1" },
        ctx("caller", UserRole.SUPER_ADMIN)
      )
    );
    expect(mocks.initiativeCreate).toHaveBeenCalled();
  });

  it("can delete initiative despite workspace MEMBER when JWT role is SUPER_ADMIN", async () => {
    mocks.initiativeDelete.mockResolvedValueOnce({});
    const tools = createToolRegistry();
    const del = tools.get("drd_delete_initiative");
    await runWithTenant(tenant("MEMBER"), () => del!({ id: "i1" }, ctx("caller", UserRole.SUPER_ADMIN)));
    expect(mocks.initiativeDelete).toHaveBeenCalled();
  });
});

describe("MCP matrix: workspace OWNER / ADMIN structure writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMembershipMock();
  });

  it.each([
    ["OWNER", "OWNER"] as const,
    ["ADMIN", "ADMIN"] as const,
  ])("%s can delete initiative", async (_label, membership) => {
    mocks.initiativeDelete.mockResolvedValueOnce({});
    const tools = createToolRegistry();
    const del = tools.get("drd_delete_initiative");
    await runWithTenant(tenant(membership), () =>
      del!({ id: "i1" }, ctx("u1", UserRole.VIEWER))
    );
    expect(mocks.initiativeDelete).toHaveBeenCalledWith({ where: { id: "i1" } });
  });

  it.each([
    ["OWNER", "OWNER"] as const,
    ["ADMIN", "ADMIN"] as const,
  ])("%s can create product", async (_label, membership) => {
    mocks.productCreate.mockResolvedValueOnce({ id: "p-new", name: "Prod" });
    const tools = createToolRegistry();
    const createProduct = tools.get("drd_create_product");
    await runWithTenant(tenant(membership), () =>
      createProduct!({ name: "Prod" }, ctx("u1", UserRole.VIEWER))
    );
    expect(mocks.productCreate).toHaveBeenCalled();
  });
});

describe("MCP matrix: VIEWER denied on all sampled content-write tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMembershipMock();
  });

  it.each([
    ["drd_create_feature", { initiativeId: "i1", title: "Feat" }],
    ["drd_update_initiative", { id: "i1", title: "Renamed" }],
    ["drd_create_requirement", { featureId: "f1", title: "Task" }],
  ] as const)("VIEWER blocked: %s", async (toolName, args) => {
    const tools = createToolRegistry();
    const handler = tools.get(toolName);
    await expect(
      runWithTenant(tenant("VIEWER"), () => handler!(args, ctx("u1", UserRole.EDITOR)))
    ).rejects.toThrow("workspace VIEWER cannot modify");
  });
});

describe("MCP matrix: read tools for VIEWER", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMembershipMock();
    mocks.initiativeFindMany.mockResolvedValueOnce([{ id: "i1", title: "Init", domainId: "d1" }]);
  });

  it("drd_list_initiatives succeeds", async () => {
    const tools = createToolRegistry();
    const list = tools.get("drd_list_initiatives");
    const result = await runWithTenant(tenant("VIEWER"), () => list!({}, ctx("u1", UserRole.VIEWER)));
    const text = (result as { content: Array<{ text?: string }> }).content[0]?.text;
    expect(JSON.parse(text!)).toEqual([{ id: "i1", title: "Init", domainId: "d1" }]);
  });

  it("tymio_list_capabilities succeeds", async () => {
    const tools = createToolRegistry();
    const list = tools.get("tymio_list_capabilities");
    await runWithTenant(tenant("VIEWER"), () => list!({}, ctx("u1", UserRole.VIEWER)));
    expect(mocks.capabilityFindMany).toHaveBeenCalled();
  });

  it("tymio_get_coding_agent_guide succeeds", async () => {
    const tools = createToolRegistry();
    const guide = tools.get("tymio_get_coding_agent_guide");
    const result = await runWithTenant(tenant("VIEWER"), () => guide!({}, ctx("u1", UserRole.VIEWER)));
    const text = (result as { content: Array<{ text?: string }> }).content[0]?.text;
    expect(text).toContain("Coding agent guide");
  });
});

describe("MCP matrix: MEMBER content writes (feature + requirement)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMembershipMock();
  });

  it("MEMBER can create feature as self owner", async () => {
    mocks.featureCreate.mockResolvedValueOnce({ id: "f-new" });
    const tools = createToolRegistry();
    const createFeature = tools.get("drd_create_feature");
    await runWithTenant(tenant("MEMBER"), () =>
      createFeature!(
        { initiativeId: "i1", title: "Story" },
        ctx("caller", UserRole.EDITOR)
      )
    );
    expect(mocks.featureCreate).toHaveBeenCalled();
  });

  it("MEMBER can create requirement without assignee", async () => {
    mocks.requirementCreate.mockResolvedValueOnce({ id: "r-new" });
    const tools = createToolRegistry();
    const createReq = tools.get("drd_create_requirement");
    await runWithTenant(tenant("MEMBER"), () =>
      createReq!(
        { featureId: "f1", title: "Do work" },
        ctx("caller", UserRole.EDITOR)
      )
    );
    expect(mocks.requirementCreate).toHaveBeenCalled();
  });

  it("MEMBER can update initiative title", async () => {
    const tools = createToolRegistry();
    const update = tools.get("drd_update_initiative");
    await runWithTenant(tenant("MEMBER"), () =>
      update!({ id: "i1", title: "New title" }, ctx("caller", UserRole.EDITOR))
    );
    expect(mocks.initiativeUpdate).toHaveBeenCalled();
  });
});

describe("MCP matrix: global ADMIN cannot bypass workspace VIEWER on structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMembershipMock();
  });

  it("VIEWER still cannot delete initiative even with global ADMIN", async () => {
    const tools = createToolRegistry();
    const del = tools.get("drd_delete_initiative");
    await expect(
      runWithTenant(tenant("VIEWER"), () => del!({ id: "i1" }, ctx("u1", UserRole.ADMIN)))
    ).rejects.toThrow("requires workspace OWNER or ADMIN");
    expect(mocks.initiativeDelete).not.toHaveBeenCalled();
  });
});
