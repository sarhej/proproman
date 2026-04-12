import { z } from "zod";
import {
  AssignmentRole,
  CampaignStatus,
  CampaignType,
  FeatureStatus,
  Horizon,
  MilestoneStatus,
  Prisma,
  Priority,
  RiskLevel,
  StoryType,
  StakeholderRole,
  StakeholderType,
  TaskStatus,
  TaskType,
  TopLevelItemType,
  UserRole
} from "@prisma/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../db.js";
import { initiativeInclude } from "../routes/serializers.js";
import { readCodingAgentGuide } from "../lib/codingAgentGuide.js";
import {
  compileBriefJson,
  compileBriefMarkdown,
  loadCapabilitiesForBrief,
  type BriefMode
} from "../services/ontologyBrief.js";
import { applyExecutionColumn } from "../services/requirementExecutionColumn.js";
import { appendMcpFeedbackToToolResult } from "../lib/mcpFeedbackNotice.js";
import { findFirstUserIdNotInTenant, listTenantMemberUsersPublic } from "../lib/tenantUserRefs.js";
import {
  isPlatformSuperAdmin,
  workspaceMembershipCanManageStructure,
  workspaceMembershipCanWriteContent
} from "../lib/workspaceRbac.js";
import { getTenantContext } from "../tenant/tenantContext.js";
import { registerWorkspaceAtlasTools } from "./workspaceAtlasTools.js";
import { notifyHubChange, type HubChangeEventPayload } from "../services/hubChangeHub.js";
import { allocateUniqueProductSlug } from "../lib/productSlug.js";
import { canUserEditInitiativeForMcp } from "../lib/initiativeMcpPermission.js";
import {
  columnInputSchema,
  columnReorderSchema,
  createBoardSchema,
  updateBoardSchema,
  updateColumnSchema
} from "../routes/execution-boards.js";
import {
  executionBoardLayoutSchema,
  featureReorderSchema,
  requirementReorderSchema,
  updatePositionsSchema
} from "../routes/schemas.js";

/** Only these user fields are exposed to MCP (so the AI can match user id). */
const userPublicSelect = { id: true, name: true, email: true, role: true } as const;

function textContent(text: string) {
  return { content: [{ type: "text" as const, text: appendMcpFeedbackToToolResult(text) }] };
}

function requireTenantContext(): void {
  const tenantContext = getTenantContext();
  if (!tenantContext) throw new Error("No tenant context — connect to a workspace first.");
}

function getUserFromCtx(ctx: unknown): { userId: string; role: string } {
  requireTenantContext();
  const extra = (ctx as { authInfo?: { extra?: Record<string, unknown> } })?.authInfo?.extra;
  if (!extra?.userId) throw new Error("Not authenticated");
  return { userId: extra.userId as string, role: extra.role as string };
}

function mcpEmitHub(input: Omit<HubChangeEventPayload, "eventId" | "changedAt" | "tenantId">): void {
  const { tenantId } = getTenantContext()!;
  notifyHubChange({ ...input, tenantId });
}

function requireMcpWorkspaceContentWrite(membershipRole: string, globalRole: string): void {
  if (isPlatformSuperAdmin(globalRole)) return;
  if (!workspaceMembershipCanWriteContent(membershipRole)) {
    throw new Error("Forbidden: workspace VIEWER cannot modify data.");
  }
}

function requireMcpWorkspaceStructureWrite(membershipRole: string, globalRole: string): void {
  if (isPlatformSuperAdmin(globalRole)) return;
  if (!workspaceMembershipCanManageStructure(membershipRole)) {
    throw new Error("Forbidden: requires workspace OWNER or ADMIN.");
  }
}

async function resolveOwnerIdForWorkspace(
  requestedOwnerId: string | null | undefined,
  callerUserId: string,
  globalRole: string,
  membershipRole: string,
  tenantId: string
): Promise<string> {
  const effective = requestedOwnerId ?? callerUserId;
  const outsider = await findFirstUserIdNotInTenant(tenantId, [effective]);
  if (outsider) {
    throw new Error(`Forbidden: user ${outsider} is not a member of this workspace.`);
  }
  if (effective !== callerUserId) {
    if (!isPlatformSuperAdmin(globalRole) && !workspaceMembershipCanManageStructure(membershipRole)) {
      throw new Error(
        "Forbidden: ownerId must match the authenticated user unless you are workspace OWNER or ADMIN."
      );
    }
  }
  return effective;
}

async function assertOwnerIdEditableForWorkspace(
  requestedOwnerId: string | null | undefined,
  callerUserId: string,
  globalRole: string,
  membershipRole: string,
  tenantId: string
): Promise<void> {
  if (requestedOwnerId === undefined) return;
  await resolveOwnerIdForWorkspace(requestedOwnerId, callerUserId, globalRole, membershipRole, tenantId);
}

async function assertAssigneeInTenant(tenantId: string, assigneeId: string | null | undefined): Promise<void> {
  if (assigneeId === undefined || assigneeId === null) return;
  const outsider = await findFirstUserIdNotInTenant(tenantId, [assigneeId]);
  if (outsider) {
    throw new Error(`Forbidden: assignee ${outsider} is not a member of this workspace.`);
  }
}

async function ensureSingleDefaultExecutionColumn(boardId: string, defaultColumnId: string | null) {
  if (!defaultColumnId) return;
  await prisma.executionColumn.updateMany({
    where: { boardId, id: { not: defaultColumnId } },
    data: { isDefault: false }
  });
}

const executionBoardListInclude = {
  columns: { orderBy: { sortOrder: "asc" as const } }
} satisfies Prisma.ExecutionBoardInclude;

const mcpSearchPaginationShape = {
  query: z
    .string()
    .min(1)
    .max(500)
    .describe("Case-insensitive contains match on title and description."),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).max(10_000).optional().default(0)
};

/** Recursively replace any user-like object (has email + name) with only id, name, email, role. */
function sanitizeUserFields(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeUserFields);
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.email === "string" && typeof obj.name === "string") {
      return {
        id: obj.id,
        name: obj.name,
        email: obj.email,
        role: obj.role
      };
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = sanitizeUserFields(v);
    return out;
  }
  return value;
}

/** Required on every MCP tool so agents cannot accidentally target the wrong workspace. */
const MCP_WORKSPACE_SLUG = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, digits, hyphens only (same as hub workspace slug rules).")
  .describe(
    "Workspace slug this call targets. Must exactly match the active MCP session workspace, or the tool is rejected (cross-workspace protection)."
  );

function mcpWithWorkspace<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).extend({ workspaceSlug: MCP_WORKSPACE_SLUG });
}

function assertMcpWorkspaceSlug(slug: unknown): void {
  const ctx = getTenantContext();
  if (!ctx) throw new Error("No tenant context — connect to a workspace first.");
  if (typeof slug !== "string" || slug.trim() === "") {
    throw new Error(
      "workspaceSlug is required on every MCP tool call. Pass the active workspace slug (must match the session)."
    );
  }
  const normalized = slug.trim().toLowerCase();
  const expected = ctx.tenantSlug.trim().toLowerCase();
  if (normalized !== expected) {
    throw new Error(
      `workspaceSlug "${slug}" does not match the active workspace "${ctx.tenantSlug}". Refusing to run cross-workspace.`
    );
  }
}

/** Same rules as HTTP requireTenantCampaignWrite: workspace content + global ADMIN or MARKETING. */
function requireMcpTenantCampaignWrite(membershipRole: string, globalRole: string): void {
  if (isPlatformSuperAdmin(globalRole)) return;
  requireMcpWorkspaceContentWrite(membershipRole, globalRole);
  if (globalRole !== UserRole.ADMIN && globalRole !== UserRole.MARKETING) {
    throw new Error("Forbidden: campaigns require global ADMIN or MARKETING (or platform super-admin).");
  }
}

/** When adding a tool below (or in `workspaceAtlasTools.ts`), update `REGISTERED_MCP_TOOL_NAMES` in `registeredMcpToolNames.ts` (Vitest enforces parity). */
export function registerTools(server: McpServer) {
  // --- Health ---
  server.registerTool(
    "drd_health",
    {
      title: "Tymio API health check",
      description: "Check MCP session is active. Requires workspaceSlug matching the session workspace.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      return textContent(JSON.stringify({ ok: true }));
    }
  );

  // --- Meta ---
  server.registerTool(
    "drd_meta",
    {
      title: "Get Tymio meta",
      description: "Get meta data: domains, products, accounts, partners, personas, revenue streams, users.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const tenantId = getTenantContext()!.tenantId;
      const [domains, personas, revenueStreams, users, products, accounts, partners] = await Promise.all([
        prisma.domain.findMany({ orderBy: { sortOrder: "asc" } }),
        prisma.persona.findMany({ orderBy: { name: "asc" } }),
        prisma.revenueStream.findMany({ orderBy: { name: "asc" } }),
        listTenantMemberUsersPublic(tenantId),
        prisma.product.findMany({ orderBy: { sortOrder: "asc" } }),
        prisma.account.findMany({ orderBy: { name: "asc" } }),
        prisma.partner.findMany({ orderBy: { name: "asc" } })
      ]);
      return textContent(JSON.stringify({ domains, personas, revenueStreams, users, products, accounts, partners }, null, 2));
    }
  );

  // --- Initiatives ---
  server.registerTool(
    "drd_list_initiatives",
    {
      title: "List initiatives",
      description: "List initiatives with optional filters: domainId, ownerId, horizon, priority, isGap.",
      inputSchema: mcpWithWorkspace({
        domainId: z.string().optional(),
        ownerId: z.string().optional(),
        horizon: z.enum(["NOW", "NEXT", "LATER"]).optional(),
        priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
        isGap: z.boolean().optional()
      })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const where: Prisma.InitiativeWhereInput = {};
      if (args.domainId) where.domainId = args.domainId;
      if (args.ownerId) where.ownerId = args.ownerId;
      if (args.horizon && Object.values(Horizon).includes(args.horizon as Horizon)) where.horizon = args.horizon as Horizon;
      if (args.priority && Object.values(Priority).includes(args.priority as Priority)) where.priority = args.priority as Priority;
      if (args.isGap !== undefined) where.isGap = args.isGap;
      const initiatives = await prisma.initiative.findMany({
        where,
        include: initiativeInclude,
        orderBy: [{ domain: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "asc" }]
      });
      return textContent(JSON.stringify(sanitizeUserFields(initiatives), null, 2));
    }
  );

  server.registerTool(
    "drd_get_initiative",
    {
      title: "Get initiative by ID",
      description: "Get a single initiative by its ID.",
      inputSchema: mcpWithWorkspace({ id: z.string() })
    },
    async ({ id, workspaceSlug }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      getUserFromCtx(ctx);
      const initiative = await prisma.initiative.findUnique({ where: { id }, include: initiativeInclude });
      if (!initiative) throw new Error("Initiative not found");
      return textContent(JSON.stringify(sanitizeUserFields(initiative), null, 2));
    }
  );

  server.registerTool(
    "drd_create_initiative",
    {
      title: "Create initiative",
      description: "Create a new initiative. Requires admin/editor role.",
      inputSchema: mcpWithWorkspace({
        title: z.string(),
        domainId: z.string(),
        productId: z.string().nullable().optional(),
        description: z.string().optional(),
        ownerId: z.string().optional(),
        priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
        horizon: z.enum(["NOW", "NEXT", "LATER"]).optional(),
        status: z.enum(["IDEA", "PLANNED", "IN_PROGRESS", "DONE", "BLOCKED"]).optional(),
        commercialType: z.string().optional(),
        isGap: z.boolean().optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { userId, role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const ownerId = await resolveOwnerIdForWorkspace(body.ownerId, userId, role, membershipRole, tenantId);
      const initiative = await prisma.initiative.create({
        data: {
          title: body.title,
          domainId: body.domainId,
          productId: body.productId ?? null,
          description: body.description ?? null,
          ownerId,
          priority: (body.priority as Priority) ?? "P2",
          horizon: (body.horizon as Horizon) ?? "NOW",
          status: (body.status as Prisma.EnumInitiativeStatusFieldUpdateOperationsInput["set"]) ?? "IDEA",
          commercialType: (body.commercialType as unknown as Prisma.EnumCommercialTypeFieldUpdateOperationsInput["set"]) ?? "CARE_QUALITY",
          isGap: body.isGap ?? false,
          isEpic: Boolean(body.productId)
        },
        include: initiativeInclude
      });
      mcpEmitHub({
        entityType: "INITIATIVE",
        operation: "CREATE",
        entityId: initiative.id,
        initiativeId: initiative.id
      });
      return textContent(JSON.stringify(sanitizeUserFields(initiative), null, 2));
    }
  );

  server.registerTool(
    "drd_update_initiative",
    {
      title: "Update initiative",
      description: "Update an existing initiative by ID.",
      inputSchema: mcpWithWorkspace({
        id: z.string(),
        title: z.string().optional(),
        domainId: z.string().optional(),
        productId: z.string().nullable().optional(),
        description: z.string().optional(),
        notes: z.string().nullable().optional(),
        ownerId: z.string().optional(),
        priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
        horizon: z.enum(["NOW", "NEXT", "LATER"]).optional(),
        status: z.enum(["IDEA", "PLANNED", "IN_PROGRESS", "DONE", "BLOCKED"]).optional(),
        commercialType: z.string().optional(),
        isGap: z.boolean().optional(),
        baseUpdatedAt: z.string().optional()
      })
    },
    async ({ id, workspaceSlug, baseUpdatedAt, ...body }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { userId, role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const existingInit = await prisma.initiative.findUnique({ where: { id } });
      if (!existingInit) {
        throw new Error("Initiative not found");
      }
      if (baseUpdatedAt !== undefined) {
        const clientMs = new Date(baseUpdatedAt).getTime();
        const serverMs = existingInit.updatedAt.getTime();
        if (Number.isNaN(clientMs) || Math.abs(clientMs - serverMs) > 2) {
          throw new Error("Conflict: initiative was changed elsewhere. Refresh and retry.");
        }
      }
      const data: Record<string, unknown> = {};
      if (body.title !== undefined) data.title = body.title;
      if (body.domainId !== undefined) data.domainId = body.domainId;
      if (body.productId !== undefined) data.productId = body.productId;
      if (body.description !== undefined) data.description = body.description;
      if (body.notes !== undefined) data.notes = body.notes;
      if (body.ownerId !== undefined) {
        await assertOwnerIdEditableForWorkspace(body.ownerId, userId, role, membershipRole, tenantId);
        data.ownerId = body.ownerId;
      }
      if (body.priority !== undefined) data.priority = body.priority;
      if (body.horizon !== undefined) data.horizon = body.horizon;
      if (body.status !== undefined) data.status = body.status;
      if (body.commercialType !== undefined) data.commercialType = body.commercialType;
      if (body.isGap !== undefined) data.isGap = body.isGap;
      const initiative = await prisma.initiative.update({ where: { id }, data, include: initiativeInclude });
      mcpEmitHub({
        entityType: "INITIATIVE",
        operation: "UPDATE",
        entityId: id,
        initiativeId: id
      });
      return textContent(JSON.stringify(sanitizeUserFields(initiative), null, 2));
    }
  );

  // Set implementation notes on each Tymio demo hub epic (initiative.notes) so they are visible in Product Explorer.
  const DR_HUB_EPIC_NOTES: Record<string, string> = {
    "Epic: Accesses & Roles": `Implementation details (Epic: Accesses & Roles)

Archive visibility and placement: archive/unarchive action restricted to Admin (or by role). Move "Archivovat / de-archivovat" button to top bar (horní list) for visibility. Initiative already has PATCH archive/unarchive; ensure UI shows archive only for users with canEditStructure or ADMIN. Files: InitiativeDetailPanel (archive button placement), InitiativeForm or panel header; permission check for archive action.`,
    "Epic: Naming & terminology": `Implementation details (Epic 1)

• 1.1 Domény → Pilíře: i18n only. Replace "Doména/Domény" with "Pilíř/Pilíře" in CZ. Files: client/src/i18n/cs.json, sk.json, en.json — keys domain, domains, domainBoard, priorityGrid.domain, filters. No API/DB change.

• 1.2 Partner × Klient: Confirm PM usage (Partner = who buys, Klient = who uses). Check i18n and labels; align or doc. No code change if correct.

• 1.3 Integrations / Integrace: i18n only. Use "Integrations" (EN), "Integrace" (CZ). Search for integration/integrac; add/update i18n keys. No API/DB change.

• 1.4 Priority: i18n. Labels Critical/High/Medium/Low. Add priority.P0 = "Critical", etc. in i18n. Use in FiltersBar, PriorityGrid, ProductTree, initiative/requirement selects. Keep P0–P3 in DB; change display only.`,
    "Epic: Bugs (fix first)": `Implementation details (Epic 2)

RACI: 2.1/2.5 — POST /api/assignments (EDITOR). Verify InitiativeDetailPanel + RaciMatrix Add. 2.2 — PUT /api/assignments (newRole, allocation). Frontend: InitiativeDetailPanel RACI tab, role dropdown + allocation; updateRole and allocation blur call api.updateAssignment. Verify UI.

Iniciativa: 2.3 — Done. InitiativeForm title in Details; api.updateInitiative. Verify title visible/editable. 2.4 — Done. Nav "New initiative" → ?new=1 → modal. Verify placement; optional board CTA.

Admin: 2.6 — Backend: initiative PUT strips productId, horizon, commercialType, dealStage for non-ADMIN. Frontend: InitiativeForm adminOnlyFields; when false those 4 selects disabled. Verify EDITOR sees them disabled. Files: InitiativeForm.tsx, call sites passing adminOnlyFields.

Požadavky: 2.7 — Done. Entry points: ProductTree, FeatureDetailPage, InitiativeDetailPanel, RequirementsPage. POST /api/requirements. Verify all four. 2.8 — Done. RequirementDetailPage taskType "Unspecified" (null). Verify create without type and edit to Unspecified.

Účty: 2.9 — Done. AccountsPage edit name/type; api.updateAccount. Verify; extend form if product needs segment/dealStage/etc.

Edit feature title: Done. FeatureDetailPage editable title, onFeatureUpdated; App merges into board.`,
    "Epic: Feature/UX requirements": `Implementation details (Epic 3)

Iniciativa – form & fields: 3.1 Show product/asset on initiative cards — InitiativeCard, initiative.product?.name. 3.2 Document upload — new InitiativeDocument or S3; additive. 3.3 Horizont Q1–Q4 — blocked by 4.6. 3.4 CK list — success-criteria exist; link Gantt completion. 3.5 Poznámky → Komentáře — expand comment UI (date, author, formatting). 3.6 Jistota data — blocked 4.1. 3.7 Přiřazení tržeb — blocked 4.2. 3.8 Save in header — move Save to sticky header. 3.9 Archive not delete — PATCH archive; "Show archived" filter. 3.10 Person radar — blocked 4.3.

Gantt: 3.11 Colours by status — use initiative.status not domain. GanttPage, timeline API. 3.12 Completion % — success criteria or completionPercent. 3.13 Views by quarter/year — time range presets. 3.14 Timing export — blocked 4.4.

Milníky: 3.15 Click status box → filter. 3.16 Archive (same as 3.9). 3.17 Chart by status in period. 3.18 Quarter filter (depends 4.6).

Kampaně: 3.19 Concept — blocked 4.5. 3.20 Show campaign date in list. 3.21 Campaign type list — after 4.5.

Účty: 3.22 Link campaign → /campaigns/:id. Produkty: 3.23 Requirements in overview — decision. 3.24 Filters status + impact.`,
    "Epic: Clarifications needed": `Implementation details (Epic 4)

Product/decision items. After each decision, implement dependent Epic 3 work.

• 4.1 Jistota data — Confirm if used; if not remove (enables 3.6).
• 4.2 Přiřazení tržeb — Align with product/Jitka (enables 3.7).
• 4.3 Person radar — Keep or drop (enables 3.10).
• 4.4 Souřad s timingem z Gantu — Define export/sync target (enables 3.14).
• 4.5 Kampaně — Align with Nela; placement and type list (enables 3.19, 3.21).
• 4.6 Horizont Q1–Q4 — Format and rules with Ondra (enables 3.3, 3.18).`
  };

  server.registerTool(
    "drd_set_dr_hub_epic_implementation_notes",
    {
      title: "Set Tymio demo hub epic implementation notes",
      description: "Set the Notes field on each Tymio demo hub epic (initiative) to the canonical implementation details for that epic. Use this so implementation details are tracked in the product (Product Explorer); open an epic and see Notes in the Details tab.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const product = await prisma.product.findFirst({ where: { name: "Tymio demo hub" } });
      if (!product) throw new Error("Product 'Tymio demo hub' not found. Run db:populate-tymio-demo --workspace server first.");
      const initiatives = await prisma.initiative.findMany({ where: { productId: product.id } });
      const updated: string[] = [];
      for (const init of initiatives) {
        const notes = DR_HUB_EPIC_NOTES[init.title];
        if (!notes) continue;
        await prisma.initiative.update({ where: { id: init.id }, data: { notes } });
        mcpEmitHub({
          entityType: "INITIATIVE",
          operation: "UPDATE",
          entityId: init.id,
          initiativeId: init.id
        });
        updated.push(init.title);
      }
      return textContent(JSON.stringify({ ok: true, updated }, null, 2));
    }
  );

  server.registerTool(
    "drd_delete_initiative",
    {
      title: "Delete initiative",
      description: "Delete an initiative by ID.",
      inputSchema: mcpWithWorkspace({ id: z.string() })
    },
    async ({ id, workspaceSlug }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      await prisma.initiative.delete({ where: { id } });
      mcpEmitHub({
        entityType: "INITIATIVE",
        operation: "DELETE",
        entityId: id,
        initiativeId: id
      });
      return textContent(JSON.stringify({ ok: true }));
    }
  );

  // --- Reference data (read-only) ---
  server.registerTool(
    "drd_list_domains",
    {
      title: "List domains",
      description: "List all domains.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      return textContent(JSON.stringify((await prisma.domain.findMany({ orderBy: { sortOrder: "asc" } })), null, 2));
    }
  );

  server.registerTool(
    "drd_create_domain",
    {
      title: "Create domain",
      description:
        "Create a new domain (pillar). Requires workspace OWNER or ADMIN (structure write).",
      inputSchema: mcpWithWorkspace({
        name: z.string().min(1),
        color: z.string().min(1),
        sortOrder: z.number().int().optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const domain = await prisma.domain.create({
        data: {
          name: body.name,
          color: body.color,
          sortOrder: body.sortOrder ?? 0
        }
      });
      return textContent(JSON.stringify(domain, null, 2));
    }
  );

  server.registerTool(
    "drd_list_products",
    {
      title: "List products",
      description: "List all products (with hierarchy).",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const products = await prisma.product.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          executionBoards: { include: { columns: { orderBy: { sortOrder: "asc" } } } }
        }
      });
      return textContent(JSON.stringify(sanitizeUserFields(products), null, 2));
    }
  );

  server.registerTool(
    "drd_create_product",
    {
      title: "Create product",
      description:
        "Create a new product (asset). Optional slug (lowercase, hyphens); default derived from name. Requires structure write in the workspace.",
      inputSchema: mcpWithWorkspace({
        name: z.string().min(1),
        slug: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .optional(),
        description: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        itemType: z.enum(["PRODUCT", "SYSTEM"]).optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const slug = await allocateUniqueProductSlug(prisma, {
        tenantId,
        fromName: body.name,
        explicitSlug: body.slug ?? null
      });
      const product = await prisma.product.create({
        data: {
          name: body.name,
          slug,
          description: body.description ?? null,
          sortOrder: body.sortOrder ?? 0,
          itemType: (body.itemType as TopLevelItemType) ?? TopLevelItemType.PRODUCT
        }
      });
      mcpEmitHub({
        entityType: "PRODUCT",
        operation: "CREATE",
        entityId: product.id,
        initiativeId: null
      });
      return textContent(JSON.stringify(product, null, 2));
    }
  );

  server.registerTool(
    "drd_update_product",
    {
      title: "Update product",
      description: "Update an existing product by ID.",
      inputSchema: mcpWithWorkspace({
        id: z.string(),
        name: z.string().min(1).optional(),
        slug: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .optional(),
        description: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        itemType: z.enum(["PRODUCT", "SYSTEM"]).optional()
      })
    },
    async ({ id, workspaceSlug, ...body }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const existing = await prisma.product.findUnique({ where: { id } });
      if (!existing) throw new Error("Product not found");
      const data: {
        name?: string;
        slug?: string;
        description?: string | null;
        sortOrder?: number;
        itemType?: TopLevelItemType;
      } = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.description !== undefined) data.description = body.description;
      if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
      if (body.itemType !== undefined) data.itemType = body.itemType as TopLevelItemType;
      if (body.slug !== undefined && body.slug !== existing.slug) {
        const taken = await prisma.product.findFirst({
          where: { tenantId, slug: body.slug, NOT: { id } }
        });
        if (taken) throw new Error("Product slug already in use in this workspace");
        data.slug = body.slug;
      }
      const product = await prisma.product.update({ where: { id }, data });
      mcpEmitHub({
        entityType: "PRODUCT",
        operation: "UPDATE",
        entityId: product.id,
        initiativeId: null
      });
      return textContent(JSON.stringify(product, null, 2));
    }
  );

  server.registerTool(
    "drd_delete_product",
    {
      title: "Delete product",
      description: "Delete a product by ID (cascades per schema). Requires workspace OWNER or ADMIN.",
      inputSchema: mcpWithWorkspace({ id: z.string() })
    },
    async ({ id, workspaceSlug }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const existing = await prisma.product.findUnique({ where: { id } });
      if (!existing) throw new Error("Product not found");
      await prisma.product.delete({ where: { id } });
      mcpEmitHub({
        entityType: "PRODUCT",
        operation: "DELETE",
        entityId: id,
        initiativeId: null
      });
      return textContent(JSON.stringify({ ok: true, deletedId: id }, null, 2));
    }
  );

  server.registerTool(
    "drd_get_product_tree",
    {
      title: "Get product tree",
      description: "Get a product with full hierarchy: initiatives (epics), features (stories), requirements (tasks). Optionally filter by productId; if omitted, returns first product by sortOrder.",
      inputSchema: mcpWithWorkspace({ productId: z.string().optional() })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      if (args.productId) {
        const product = await prisma.product.findUnique({
          where: { id: args.productId },
          include: {
            executionBoards: {
              include: { columns: { orderBy: { sortOrder: "asc" } } },
              orderBy: { createdAt: "asc" }
            },
            initiatives: {
              orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
              include: {
                domain: { select: { id: true, name: true, color: true } },
                owner: { select: userPublicSelect },
                features: {
                  orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
                  include: {
                    owner: { select: userPublicSelect },
                    requirements: {
                      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                      include: {
                        assignee: { select: userPublicSelect },
                        executionColumn: true
                      }
                    }
                  }
                }
              }
            }
          }
        });
        if (!product) throw new Error("Product not found");
        return textContent(JSON.stringify(sanitizeUserFields(product), null, 2));
      }
      const product = await prisma.product.findFirst({
        orderBy: { sortOrder: "asc" },
        include: {
          executionBoards: {
            include: { columns: { orderBy: { sortOrder: "asc" } } },
            orderBy: { createdAt: "asc" }
          },
          initiatives: {
            orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
            include: {
              domain: { select: { id: true, name: true, color: true } },
              owner: { select: userPublicSelect },
              features: {
                orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
                include: {
                  owner: { select: userPublicSelect },
                  requirements: {
                    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                    include: {
                      assignee: { select: userPublicSelect },
                      executionColumn: true
                    }
                  }
                }
              }
            }
          }
        }
      });
      if (!product) throw new Error("No product found");
      return textContent(JSON.stringify(sanitizeUserFields(product), null, 2));
    }
  );

  server.registerTool(
    "drd_list_personas",
    {
      title: "List personas",
      description: "List all personas.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      return textContent(JSON.stringify((await prisma.persona.findMany({ orderBy: { name: "asc" } })), null, 2));
    }
  );

  server.registerTool(
    "drd_list_accounts",
    {
      title: "List accounts",
      description: "List all accounts.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      return textContent(JSON.stringify((await prisma.account.findMany({ orderBy: { name: "asc" } })), null, 2));
    }
  );

  server.registerTool(
    "drd_list_partners",
    {
      title: "List partners",
      description: "List all partners.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      return textContent(JSON.stringify((await prisma.partner.findMany({ orderBy: { name: "asc" } })), null, 2));
    }
  );

  server.registerTool(
    "drd_list_kpis",
    {
      title: "List KPIs",
      description: "List all initiative KPIs with their initiative context.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const kpis = await prisma.initiativeKPI.findMany({
        include: { initiative: { select: { id: true, title: true, startDate: true, domain: { select: { id: true, name: true, color: true } }, owner: { select: userPublicSelect } } } },
        orderBy: { initiative: { title: "asc" } }
      });
      return textContent(JSON.stringify(kpis, null, 2));
    }
  );

  server.registerTool(
    "drd_list_milestones",
    {
      title: "List milestones",
      description: "List all initiative milestones.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const milestones = await prisma.initiativeMilestone.findMany({
        include: { initiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } }, owner: { select: userPublicSelect } } } },
        orderBy: { initiative: { title: "asc" } }
      });
      return textContent(JSON.stringify(milestones, null, 2));
    }
  );

  server.registerTool(
    "drd_list_demands",
    {
      title: "List demands",
      description: "List all demands (from accounts, partners, internal, compliance).",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const demands = await prisma.demand.findMany({ include: { account: true, partner: true }, orderBy: { createdAt: "desc" } });
      return textContent(JSON.stringify(demands, null, 2));
    }
  );

  server.registerTool(
    "drd_list_revenue_streams",
    {
      title: "List revenue streams",
      description: "List all revenue streams.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      return textContent(JSON.stringify((await prisma.revenueStream.findMany({ orderBy: { name: "asc" } })), null, 2));
    }
  );

  // --- Features ---
  server.registerTool(
    "drd_list_features",
    {
      title: "List features",
      description: "List all features with initiative context. Optionally filter by initiativeId.",
      inputSchema: mcpWithWorkspace({ initiativeId: z.string().optional() })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const features = await prisma.feature.findMany({
        where: args.initiativeId ? { initiativeId: args.initiativeId } : undefined,
        include: { initiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } }, owner: { select: userPublicSelect } } }, owner: true },
        orderBy: [{ initiative: { title: "asc" } }, { sortOrder: "asc" }]
      });
      return textContent(JSON.stringify(sanitizeUserFields(features), null, 2));
    }
  );

  server.registerTool(
    "drd_create_feature",
    {
      title: "Create feature",
      description: "Create a new feature (user story) under an initiative. Requires admin/editor role.",
      inputSchema: mcpWithWorkspace({
        initiativeId: z.string(),
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        acceptanceCriteria: z.string().nullable().optional(),
        storyPoints: z.number().int().min(0).nullable().optional(),
        storyType: z.enum(["FUNCTIONAL", "BUG", "TECH_DEBT", "RESEARCH"]).nullable().optional(),
        ownerId: z.string().nullable().optional(),
        status: z.enum(["IDEA", "PLANNED", "IN_PROGRESS", "BUSINESS_APPROVAL", "DONE"]).optional(),
        sortOrder: z.number().int().optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { userId, role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const ownerId = await resolveOwnerIdForWorkspace(body.ownerId, userId, role, membershipRole, tenantId);
      const feature = await prisma.feature.create({
        data: {
          initiativeId: body.initiativeId,
          title: body.title,
          description: body.description ?? null,
          acceptanceCriteria: body.acceptanceCriteria ?? null,
          storyPoints: body.storyPoints ?? null,
          storyType: body.storyType ? (body.storyType as StoryType) : null,
          ownerId,
          status: (body.status as FeatureStatus) ?? FeatureStatus.IDEA,
          sortOrder: body.sortOrder ?? 0
        },
        include: { initiative: { select: { id: true, title: true } }, owner: true }
      });
      mcpEmitHub({
        entityType: "FEATURE",
        operation: "CREATE",
        entityId: feature.id,
        initiativeId: body.initiativeId
      });
      return textContent(JSON.stringify(feature, null, 2));
    }
  );

  server.registerTool(
    "drd_update_feature",
    {
      title: "Update feature",
      description: "Update an existing feature (user story) by ID.",
      inputSchema: mcpWithWorkspace({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        acceptanceCriteria: z.string().nullable().optional(),
        storyPoints: z.number().int().min(0).nullable().optional(),
        storyType: z.enum(["FUNCTIONAL", "BUG", "TECH_DEBT", "RESEARCH"]).nullable().optional(),
        ownerId: z.string().nullable().optional(),
        status: z.enum(["IDEA", "PLANNED", "IN_PROGRESS", "BUSINESS_APPROVAL", "DONE"]).optional(),
        sortOrder: z.number().int().optional()
      })
    },
    async ({ id, workspaceSlug, ...body }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { userId, role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const data: Record<string, unknown> = {};
      if (body.title !== undefined) data.title = body.title;
      if (body.description !== undefined) data.description = body.description;
      if (body.acceptanceCriteria !== undefined) data.acceptanceCriteria = body.acceptanceCriteria;
      if (body.storyPoints !== undefined) data.storyPoints = body.storyPoints;
      if (body.storyType !== undefined) data.storyType = body.storyType;
      if (body.ownerId !== undefined) {
        await assertOwnerIdEditableForWorkspace(body.ownerId, userId, role, membershipRole, tenantId);
        data.ownerId = body.ownerId;
      }
      if (body.status !== undefined) data.status = body.status;
      if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
      const feature = await prisma.feature.update({
        where: { id },
        data,
        include: { initiative: { select: { id: true, title: true } }, owner: true }
      });
      mcpEmitHub({
        entityType: "FEATURE",
        operation: "UPDATE",
        entityId: id,
        initiativeId: feature.initiativeId
      });
      return textContent(JSON.stringify(feature, null, 2));
    }
  );

  server.registerTool(
    "drd_move_feature",
    {
      title: "Move feature to another initiative",
      description:
        "Changes initiativeId for a feature when source and target initiatives share the same productId (including both unset). Requires edit rights on both initiatives (owner, RACI assignee, or workspace OWNER/ADMIN). Optional sortOrder; when moving across initiatives and omitted, appends after the current max sortOrder in the target.",
      inputSchema: mcpWithWorkspace({
        featureId: z.string().min(1),
        targetInitiativeId: z.string().min(1),
        sortOrder: z.number().int().optional()
      })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { userId, role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const feature = await prisma.feature.findUnique({
        where: { id: args.featureId },
        select: {
          id: true,
          initiativeId: true,
          initiative: { select: { id: true, productId: true } }
        }
      });
      if (!feature) throw new Error("Feature not found");
      const sourceInitiativeId = feature.initiativeId;
      const sourceProductId = feature.initiative.productId ?? null;
      const target = await prisma.initiative.findUnique({
        where: { id: args.targetInitiativeId },
        select: { id: true, productId: true }
      });
      if (!target) throw new Error("Target initiative not found");
      const targetProductId = target.productId ?? null;
      if (sourceProductId !== targetProductId) {
        throw new Error(
          "Feature and target initiative must belong to the same product (matching productId, including both unset)."
        );
      }
      const canSource = await canUserEditInitiativeForMcp(userId, role, membershipRole, sourceInitiativeId);
      if (!canSource) throw new Error(`Forbidden: cannot move feature from initiative ${sourceInitiativeId}`);
      const canTarget = await canUserEditInitiativeForMcp(userId, role, membershipRole, args.targetInitiativeId);
      if (!canTarget) throw new Error(`Forbidden: cannot move feature to initiative ${args.targetInitiativeId}`);

      if (sourceInitiativeId === args.targetInitiativeId) {
        if (args.sortOrder === undefined) {
          const unchanged = await prisma.feature.findUnique({
            where: { id: args.featureId },
            include: { initiative: { select: { id: true, title: true } }, owner: true }
          });
          mcpEmitHub({
            entityType: "FEATURE",
            operation: "UPDATE",
            entityId: args.featureId,
            initiativeId: sourceInitiativeId
          });
          return textContent(JSON.stringify(sanitizeUserFields(unchanged), null, 2));
        }
        const updated = await prisma.feature.update({
          where: { id: args.featureId },
          data: { sortOrder: args.sortOrder },
          include: { initiative: { select: { id: true, title: true } }, owner: true }
        });
        mcpEmitHub({
          entityType: "FEATURE",
          operation: "UPDATE",
          entityId: args.featureId,
          initiativeId: updated.initiativeId
        });
        return textContent(JSON.stringify(sanitizeUserFields(updated), null, 2));
      }

      let nextSort = args.sortOrder;
      if (nextSort === undefined) {
        const agg = await prisma.feature.aggregate({
          where: { initiativeId: args.targetInitiativeId },
          _max: { sortOrder: true }
        });
        nextSort = (agg._max.sortOrder ?? -1) + 1;
      }
      const moved = await prisma.feature.update({
        where: { id: args.featureId },
        data: { initiativeId: args.targetInitiativeId, sortOrder: nextSort },
        include: { initiative: { select: { id: true, title: true } }, owner: true }
      });
      mcpEmitHub({
        entityType: "FEATURE",
        operation: "UPDATE",
        entityId: args.featureId,
        initiativeId: args.targetInitiativeId
      });
      return textContent(JSON.stringify(sanitizeUserFields(moved), null, 2));
    }
  );

  server.registerTool(
    "drd_delete_feature",
    {
      title: "Delete feature",
      description: "Delete a feature by ID (cascades requirements per schema). Requires workspace content write.",
      inputSchema: mcpWithWorkspace({ id: z.string() })
    },
    async ({ id, workspaceSlug }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const existing = await prisma.feature.findUnique({ where: { id } });
      if (!existing) throw new Error("Feature not found");
      await prisma.feature.delete({ where: { id } });
      mcpEmitHub({
        entityType: "FEATURE",
        operation: "DELETE",
        entityId: id,
        initiativeId: existing.initiativeId
      });
      return textContent(JSON.stringify({ ok: true, deletedId: id }, null, 2));
    }
  );

  // --- Decisions ---
  server.registerTool(
    "drd_list_decisions",
    {
      title: "List decisions",
      description: "List all initiative decisions. Optionally filter by initiativeId.",
      inputSchema: mcpWithWorkspace({ initiativeId: z.string().optional() })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const decisions = await prisma.decision.findMany({
        where: args.initiativeId ? { initiativeId: args.initiativeId } : undefined,
        include: { initiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } }, owner: { select: userPublicSelect } } } },
        orderBy: { createdAt: "desc" }
      });
      return textContent(JSON.stringify(decisions, null, 2));
    }
  );

  server.registerTool(
    "drd_list_risks",
    {
      title: "List risks",
      description: "List all initiative risks with owner. Optionally filter by initiativeId.",
      inputSchema: mcpWithWorkspace({ initiativeId: z.string().optional() })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const risks = await prisma.risk.findMany({
        where: args.initiativeId ? { initiativeId: args.initiativeId } : undefined,
        include: { initiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } }, owner: { select: userPublicSelect } } }, owner: true },
        orderBy: { createdAt: "desc" }
      });
      return textContent(JSON.stringify(sanitizeUserFields(risks), null, 2));
    }
  );

  // --- Dependencies (Dependency rows are not tenant-scoped in Prisma; filter via initiative.tenantId) ---
  server.registerTool(
    "drd_list_dependencies",
    {
      title: "List dependencies",
      description: "List initiative dependencies (from/to) for the active workspace only.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const tenantId = getTenantContext()!.tenantId;
      const deps = await prisma.dependency.findMany({
        where: {
          fromInitiative: { tenantId },
          toInitiative: { tenantId }
        },
        include: {
          fromInitiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } } } },
          toInitiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } } } }
        }
      });
      return textContent(JSON.stringify(deps, null, 2));
    }
  );

  server.registerTool(
    "drd_create_decision",
    {
      title: "Create decision",
      description: "Add a decision to an initiative in this workspace. Requires workspace content write.",
      inputSchema: mcpWithWorkspace({
        initiativeId: z.string().min(1),
        title: z.string().min(1),
        rationale: z.string().nullable().optional(),
        impactedTeams: z.string().nullable().optional(),
        decidedAt: z.string().datetime().nullable().optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const init = await prisma.initiative.findUnique({ where: { id: body.initiativeId } });
      if (!init) throw new Error("Initiative not found in this workspace");
      const decision = await prisma.decision.create({
        data: {
          initiativeId: body.initiativeId,
          title: body.title,
          rationale: body.rationale ?? null,
          impactedTeams: body.impactedTeams ?? null,
          decidedAt: body.decidedAt ? new Date(body.decidedAt) : null
        }
      });
      return textContent(JSON.stringify(decision, null, 2));
    }
  );

  server.registerTool(
    "drd_delete_decision",
    {
      title: "Delete decision",
      description: "Delete a decision by ID in this workspace.",
      inputSchema: mcpWithWorkspace({ id: z.string() })
    },
    async ({ id, workspaceSlug }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const existing = await prisma.decision.findUnique({ where: { id } });
      if (!existing) throw new Error("Decision not found");
      await prisma.decision.delete({ where: { id } });
      return textContent(JSON.stringify({ ok: true, deletedId: id }, null, 2));
    }
  );

  server.registerTool(
    "drd_create_risk",
    {
      title: "Create risk",
      description: "Add a risk to an initiative. Requires workspace content write.",
      inputSchema: mcpWithWorkspace({
        initiativeId: z.string().min(1),
        title: z.string().min(1),
        probability: z.nativeEnum(RiskLevel),
        impact: z.nativeEnum(RiskLevel),
        mitigation: z.string().nullable().optional(),
        ownerId: z.string().nullable().optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const init = await prisma.initiative.findUnique({ where: { id: body.initiativeId } });
      if (!init) throw new Error("Initiative not found in this workspace");
      if (body.ownerId) {
        await assertAssigneeInTenant(tenantId, body.ownerId);
      }
      const risk = await prisma.risk.create({
        data: {
          initiativeId: body.initiativeId,
          title: body.title,
          probability: body.probability as RiskLevel,
          impact: body.impact as RiskLevel,
          mitigation: body.mitigation ?? null,
          ownerId: body.ownerId ?? null
        },
        include: { owner: true }
      });
      return textContent(JSON.stringify(sanitizeUserFields(risk), null, 2));
    }
  );

  server.registerTool(
    "drd_delete_risk",
    {
      title: "Delete risk",
      description: "Delete a risk by ID in this workspace.",
      inputSchema: mcpWithWorkspace({ id: z.string() })
    },
    async ({ id, workspaceSlug }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const existing = await prisma.risk.findUnique({ where: { id } });
      if (!existing) throw new Error("Risk not found");
      await prisma.risk.delete({ where: { id } });
      return textContent(JSON.stringify({ ok: true, deletedId: id }, null, 2));
    }
  );

  server.registerTool(
    "drd_create_dependency",
    {
      title: "Create dependency",
      description: "Link two initiatives (from blocks until to resolves). Requires workspace OWNER or ADMIN.",
      inputSchema: mcpWithWorkspace({
        fromInitiativeId: z.string().min(1),
        toInitiativeId: z.string().min(1),
        description: z.string().nullable().optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const fromI = await prisma.initiative.findUnique({ where: { id: body.fromInitiativeId } });
      const toI = await prisma.initiative.findUnique({ where: { id: body.toInitiativeId } });
      if (!fromI || !toI) throw new Error("One or both initiatives not found in this workspace");
      const dep = await prisma.dependency.create({
        data: {
          fromInitiativeId: body.fromInitiativeId,
          toInitiativeId: body.toInitiativeId,
          description: body.description ?? null
        }
      });
      return textContent(JSON.stringify({ dependency: dep }, null, 2));
    }
  );

  server.registerTool(
    "drd_delete_dependency",
    {
      title: "Delete dependency",
      description: "Remove dependency edge between two initiatives. Requires workspace OWNER or ADMIN.",
      inputSchema: mcpWithWorkspace({
        fromInitiativeId: z.string().min(1),
        toInitiativeId: z.string().min(1)
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const fromI = await prisma.initiative.findUnique({ where: { id: body.fromInitiativeId } });
      const toI = await prisma.initiative.findUnique({ where: { id: body.toInitiativeId } });
      if (!fromI || !toI) throw new Error("One or both initiatives not found in this workspace");
      await prisma.dependency.delete({
        where: {
          fromInitiativeId_toInitiativeId: {
            fromInitiativeId: body.fromInitiativeId,
            toInitiativeId: body.toInitiativeId
          }
        }
      });
      return textContent(JSON.stringify({ ok: true }, null, 2));
    }
  );

  // --- Requirements ---
  server.registerTool(
    "drd_list_requirements",
    {
      title: "List requirements",
      description: "List all feature requirements with feature and initiative context. Optionally filter by featureId.",
      inputSchema: mcpWithWorkspace({ featureId: z.string().optional() })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const requirements = await prisma.requirement.findMany({
        where: args.featureId ? { featureId: args.featureId } : undefined,
        include: {
          feature: { include: { initiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } } } } } },
          assignee: { select: userPublicSelect },
          executionColumn: true
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      });
      return textContent(JSON.stringify(sanitizeUserFields(requirements), null, 2));
    }
  );

  const requirementTaskFields = {
    featureId: z.string(),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    status: z.enum(["NOT_STARTED", "IN_PROGRESS", "TESTING", "DONE"]).optional(),
    isDone: z.boolean().optional(),
    priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
    assigneeId: z.string().nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    estimate: z.string().nullable().optional(),
    labels: z.array(z.string()).nullable().optional(),
    taskType: z.enum(["TASK", "SPIKE", "QA", "DESIGN"]).nullable().optional(),
    blockedReason: z.string().nullable().optional(),
    externalRef: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).nullable().optional(),
    sortOrder: z.number().int().optional(),
    executionColumnId: z.string().nullable().optional()
  };

  server.registerTool(
    "drd_create_requirement",
    {
      title: "Create requirement",
      description: "Create a new requirement (task) under a feature. Supports full task fields for Kanban/Notion readiness. Requires admin/editor role.",
      inputSchema: mcpWithWorkspace(requirementTaskFields)
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      await assertAssigneeInTenant(tenantId, body.assigneeId);
      let status = body.status ? (body.status as TaskStatus) : TaskStatus.NOT_STARTED;
      let isDone = body.isDone ?? false;
      let executionColumnId: string | null | undefined = undefined;
      if (body.executionColumnId !== undefined) {
        if (body.executionColumnId === null) {
          executionColumnId = null;
        } else {
          const applied = await applyExecutionColumn(body.featureId, body.executionColumnId);
          status = applied.status!;
          isDone = applied.isDone!;
          executionColumnId = applied.executionColumnId;
        }
      }
      const requirement = await prisma.requirement.create({
        data: {
          featureId: body.featureId,
          title: body.title,
          description: body.description ?? null,
          status,
          isDone,
          priority: (body.priority as Priority) ?? Priority.P2,
          assigneeId: body.assigneeId ?? null,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          estimate: body.estimate ?? null,
          labels: body.labels === null ? Prisma.JsonNull : (body.labels ?? undefined),
          taskType: body.taskType ? (body.taskType as TaskType) : null,
          blockedReason: body.blockedReason ?? null,
          externalRef: body.externalRef ?? null,
          metadata: body.metadata === null ? Prisma.JsonNull : ((body.metadata ?? undefined) as Prisma.InputJsonValue),
          sortOrder: body.sortOrder ?? 0,
          ...(executionColumnId !== undefined ? { executionColumnId } : {})
        },
        include: {
          feature: { select: { id: true, title: true, initiativeId: true } },
          assignee: { select: userPublicSelect },
          executionColumn: true
        }
      });
      mcpEmitHub({
        entityType: "REQUIREMENT",
        operation: "CREATE",
        entityId: requirement.id,
        initiativeId: requirement.feature?.initiativeId ?? null
      });
      return textContent(JSON.stringify(sanitizeUserFields(requirement), null, 2));
    }
  );

  const updateRequirementSchema = z.object({
    id: z.string(),
    featureId: z.string().optional(),
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    status: z.enum(["NOT_STARTED", "IN_PROGRESS", "TESTING", "DONE"]).optional(),
    isDone: z.boolean().optional(),
    priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
    assigneeId: z.string().nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    estimate: z.string().nullable().optional(),
    labels: z.array(z.string()).nullable().optional(),
    taskType: z.enum(["TASK", "SPIKE", "QA", "DESIGN"]).nullable().optional(),
    blockedReason: z.string().nullable().optional(),
    externalRef: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).nullable().optional(),
    sortOrder: z.number().int().optional(),
    executionColumnId: z.string().nullable().optional()
  });

  const updateRequirementSchemaWithWorkspace = updateRequirementSchema.extend({
    workspaceSlug: MCP_WORKSPACE_SLUG
  });

  server.registerTool(
    "drd_update_requirement",
    {
      title: "Update requirement",
      description: "Update an existing requirement (task) by ID. Supports full task payload: status, assigneeId, dueDate, estimate, labels, taskType, blockedReason, externalRef, metadata.",
      inputSchema: updateRequirementSchemaWithWorkspace
    },
    async (args, ctx) => {
      const parsed = updateRequirementSchemaWithWorkspace.parse(args);
      const { id, workspaceSlug, ...body } = parsed;
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const existing = await prisma.requirement.findUnique({
        where: { id },
        select: { featureId: true }
      });
      if (!existing) throw new Error("Requirement not found");
      const featureId = body.featureId ?? existing.featureId;
      if (body.assigneeId !== undefined) {
        await assertAssigneeInTenant(tenantId, body.assigneeId);
      }
      const data: Prisma.RequirementUncheckedUpdateInput = {};
      if (body.featureId !== undefined) data.featureId = body.featureId;
      if (body.title !== undefined) data.title = body.title;
      if (body.description !== undefined) data.description = body.description;
      if (body.status !== undefined) data.status = body.status as TaskStatus;
      if (body.isDone !== undefined) data.isDone = body.isDone;
      if (body.priority !== undefined) data.priority = body.priority as Priority;
      if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
      if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      if (body.estimate !== undefined) data.estimate = body.estimate;
      if (body.labels !== undefined) data.labels = body.labels === null ? Prisma.JsonNull : (body.labels as Prisma.InputJsonValue);
      if (body.taskType !== undefined) data.taskType = body.taskType as TaskType | null;
      if (body.blockedReason !== undefined) data.blockedReason = body.blockedReason;
      if (body.externalRef !== undefined) data.externalRef = body.externalRef;
      if (body.metadata !== undefined) data.metadata = body.metadata === null ? Prisma.JsonNull : (body.metadata as Prisma.InputJsonValue);
      if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
      if (body.executionColumnId !== undefined) {
        if (body.executionColumnId === null) {
          data.executionColumnId = null;
        } else {
          const applied = await applyExecutionColumn(featureId, body.executionColumnId);
          data.executionColumnId = applied.executionColumnId;
          if (applied.status !== undefined) data.status = applied.status;
          if (applied.isDone !== undefined) data.isDone = applied.isDone;
        }
      }
      const requirement = await prisma.requirement.update({
        where: { id },
        data,
        include: {
          feature: { select: { id: true, title: true, initiativeId: true } },
          assignee: { select: userPublicSelect },
          executionColumn: true
        }
      });
      mcpEmitHub({
        entityType: "REQUIREMENT",
        operation: "UPDATE",
        entityId: id,
        initiativeId: requirement.feature.initiativeId
      });
      return textContent(JSON.stringify(sanitizeUserFields(requirement), null, 2));
    }
  );

  const upsertRequirementSchema = z.object({
    featureId: z.string(),
    title: z.string().min(1),
    externalRef: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    status: z.enum(["NOT_STARTED", "IN_PROGRESS", "TESTING", "DONE"]).optional(),
    isDone: z.boolean().optional(),
    priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
    assigneeId: z.string().nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    estimate: z.string().nullable().optional(),
    labels: z.array(z.string()).nullable().optional(),
    taskType: z.enum(["TASK", "SPIKE", "QA", "DESIGN"]).nullable().optional(),
    blockedReason: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).nullable().optional(),
    sortOrder: z.number().int().optional()
  });

  const upsertRequirementSchemaWithWorkspace = upsertRequirementSchema.extend({
    workspaceSlug: MCP_WORKSPACE_SLUG
  });

  server.registerTool(
    "drd_upsert_requirement",
    {
      title: "Upsert requirement",
      description: "Idempotent create-or-update a requirement (task): find by featureId and either externalRef or normalized title; if found, update with payload, else create. Use for imports to avoid duplicates.",
      inputSchema: upsertRequirementSchemaWithWorkspace
    },
    async (args, ctx) => {
      const body = upsertRequirementSchemaWithWorkspace.parse(args);
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      await assertAssigneeInTenant(tenantId, body.assigneeId);
      const where = body.externalRef
        ? { featureId: body.featureId, externalRef: body.externalRef }
        : { featureId: body.featureId, title: body.title.trim() };
      const existing = await prisma.requirement.findFirst({ where });
      const createData: Prisma.RequirementUncheckedCreateInput = {
        featureId: body.featureId,
        title: body.title,
        description: body.description ?? null,
        status: (body.status as TaskStatus) ?? TaskStatus.NOT_STARTED,
        isDone: body.isDone ?? false,
        priority: (body.priority as Priority) ?? Priority.P2,
        assigneeId: body.assigneeId ?? null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        estimate: body.estimate ?? null,
        labels: body.labels === null ? Prisma.JsonNull : (body.labels as Prisma.InputJsonValue),
        taskType: body.taskType ? (body.taskType as TaskType) : null,
        blockedReason: body.blockedReason ?? null,
        externalRef: body.externalRef ?? null,
        metadata: body.metadata === null ? Prisma.JsonNull : (body.metadata as Prisma.InputJsonValue),
        sortOrder: body.sortOrder ?? 0
      };
      if (existing) {
        const updateData: Prisma.RequirementUncheckedUpdateInput = {
          title: createData.title,
          description: createData.description,
          status: createData.status,
          isDone: createData.isDone,
          priority: createData.priority,
          assigneeId: createData.assigneeId,
          dueDate: createData.dueDate,
          estimate: createData.estimate,
          labels: createData.labels,
          taskType: createData.taskType,
          blockedReason: createData.blockedReason,
          externalRef: createData.externalRef,
          metadata: createData.metadata,
          sortOrder: createData.sortOrder
        };
        const requirement = await prisma.requirement.update({
          where: { id: existing.id },
          data: updateData,
          include: { feature: { select: { id: true, title: true, initiativeId: true } }, assignee: { select: userPublicSelect } }
        });
        mcpEmitHub({
          entityType: "REQUIREMENT",
          operation: "UPDATE",
          entityId: requirement.id,
          initiativeId: requirement.feature.initiativeId
        });
        return textContent(JSON.stringify({ updated: true, requirement: sanitizeUserFields(requirement) }, null, 2));
      }
      const requirement = await prisma.requirement.create({
        data: createData,
        include: { feature: { select: { id: true, title: true, initiativeId: true } }, assignee: { select: userPublicSelect } }
      });
      mcpEmitHub({
        entityType: "REQUIREMENT",
        operation: "CREATE",
        entityId: requirement.id,
        initiativeId: requirement.feature.initiativeId
      });
      return textContent(JSON.stringify({ created: true, requirement: sanitizeUserFields(requirement) }, null, 2));
    }
  );

  server.registerTool(
    "drd_delete_requirement",
    {
      title: "Delete requirement",
      description: "Delete a requirement (task) by ID in this workspace.",
      inputSchema: mcpWithWorkspace({ id: z.string() })
    },
    async ({ id, workspaceSlug }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const existing = await prisma.requirement.findUnique({
        where: { id },
        include: { feature: { select: { initiativeId: true } } }
      });
      if (!existing) throw new Error("Requirement not found");
      await prisma.requirement.delete({ where: { id } });
      mcpEmitHub({
        entityType: "REQUIREMENT",
        operation: "DELETE",
        entityId: id,
        initiativeId: existing.feature.initiativeId
      });
      return textContent(JSON.stringify({ ok: true, deletedId: id }, null, 2));
    }
  );

  // --- Assignments ---
  server.registerTool(
    "drd_list_assignments",
    {
      title: "List assignments",
      description: "List all initiative assignments (user roles). Optionally filter by initiativeId.",
      inputSchema: mcpWithWorkspace({ initiativeId: z.string().optional() })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const assignments = await prisma.initiativeAssignment.findMany({
        where: args.initiativeId ? { initiativeId: args.initiativeId } : undefined,
        include: { user: true, initiative: { select: { id: true, title: true, domain: { select: { id: true, name: true } } } } },
        orderBy: [{ initiativeId: "asc" }, { role: "asc" }]
      });
      return textContent(JSON.stringify(sanitizeUserFields(assignments), null, 2));
    }
  );

  server.registerTool(
    "drd_upsert_assignment",
    {
      title: "Upsert assignment",
      description: "Create or update an initiative assignment (RACI). ACCOUNTABLE replaces prior accountable and syncs initiative owner. Requires workspace content write.",
      inputSchema: mcpWithWorkspace({
        initiativeId: z.string().min(1),
        userId: z.string().min(1),
        role: z.nativeEnum(AssignmentRole),
        allocation: z.number().int().min(0).max(100).nullable().optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const outsider = await findFirstUserIdNotInTenant(tenantId, [body.userId]);
      if (outsider) throw new Error(`User is not a member of this workspace: ${outsider}`);
      const init = await prisma.initiative.findUnique({ where: { id: body.initiativeId } });
      if (!init) throw new Error("Initiative not found in this workspace");
      if (body.role === AssignmentRole.ACCOUNTABLE) {
        await prisma.initiativeAssignment.deleteMany({
          where: { initiativeId: body.initiativeId, role: AssignmentRole.ACCOUNTABLE }
        });
      }
      const assignment = await prisma.initiativeAssignment.upsert({
        where: {
          initiativeId_userId_role: {
            initiativeId: body.initiativeId,
            userId: body.userId,
            role: body.role
          }
        },
        create: {
          initiativeId: body.initiativeId,
          userId: body.userId,
          role: body.role,
          allocation: body.allocation ?? null
        },
        update: { allocation: body.allocation ?? null },
        include: { user: true }
      });
      if (body.role === AssignmentRole.ACCOUNTABLE) {
        await prisma.initiative.update({
          where: { id: body.initiativeId },
          data: { ownerId: body.userId }
        });
      }
      return textContent(JSON.stringify(sanitizeUserFields(assignment), null, 2));
    }
  );

  server.registerTool(
    "drd_update_assignment",
    {
      title: "Update assignment",
      description: "Change assignment role and/or allocation (same semantics as PUT /api/assignments).",
      inputSchema: mcpWithWorkspace({
        initiativeId: z.string().min(1),
        userId: z.string().min(1),
        role: z.nativeEnum(AssignmentRole),
        newRole: z.nativeEnum(AssignmentRole).optional(),
        allocation: z.number().int().min(0).max(100).nullable().optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const outsiderPut = await findFirstUserIdNotInTenant(tenantId, [body.userId]);
      if (outsiderPut) throw new Error(`User is not a member of this workspace: ${outsiderPut}`);
      const { initiativeId, userId, role: assignmentRole, newRole, allocation } = body;
      const existing = await prisma.initiativeAssignment.findUnique({
        where: { initiativeId_userId_role: { initiativeId, userId, role: assignmentRole } }
      });
      if (!existing) throw new Error("Assignment not found");
      if (newRole !== undefined && newRole !== assignmentRole) {
        await prisma.$transaction(async (tx) => {
          await tx.initiativeAssignment.delete({
            where: { initiativeId_userId_role: { initiativeId, userId, role: assignmentRole } }
          });
          if (assignmentRole === AssignmentRole.ACCOUNTABLE) {
            await tx.initiative.update({ where: { id: initiativeId }, data: { ownerId: null } });
          }
          await tx.initiativeAssignment.upsert({
            where: { initiativeId_userId_role: { initiativeId, userId, role: newRole } },
            create: {
              initiativeId,
              userId,
              role: newRole,
              allocation: allocation ?? existing.allocation
            },
            update: { allocation: allocation ?? existing.allocation }
          });
          if (newRole === AssignmentRole.ACCOUNTABLE) {
            await tx.initiative.update({ where: { id: initiativeId }, data: { ownerId: userId } });
          }
        });
        const updated = await prisma.initiativeAssignment.findUnique({
          where: { initiativeId_userId_role: { initiativeId, userId, role: newRole } },
          include: { user: true }
        });
        return textContent(JSON.stringify(sanitizeUserFields(updated), null, 2));
      }
      if (allocation !== undefined) {
        const assignment = await prisma.initiativeAssignment.update({
          where: { initiativeId_userId_role: { initiativeId, userId, role: assignmentRole } },
          data: { allocation },
          include: { user: true }
        });
        return textContent(JSON.stringify(sanitizeUserFields(assignment), null, 2));
      }
      throw new Error("Provide newRole and/or allocation to update");
    }
  );

  server.registerTool(
    "drd_delete_assignment",
    {
      title: "Delete assignment",
      description: "Remove an assignment triple. Requires workspace OWNER or ADMIN. Clears initiative owner if role was ACCOUNTABLE.",
      inputSchema: mcpWithWorkspace({
        initiativeId: z.string().min(1),
        userId: z.string().min(1),
        role: z.nativeEnum(AssignmentRole)
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const init = await prisma.initiative.findUnique({ where: { id: body.initiativeId } });
      if (!init) throw new Error("Initiative not found in this workspace");
      await prisma.initiativeAssignment.delete({
        where: {
          initiativeId_userId_role: {
            initiativeId: body.initiativeId,
            userId: body.userId,
            role: body.role
          }
        }
      });
      if (body.role === AssignmentRole.ACCOUNTABLE) {
        await prisma.initiative.update({
          where: { id: body.initiativeId },
          data: { ownerId: null }
        });
      }
      return textContent(JSON.stringify({ ok: true }, null, 2));
    }
  );

  // --- Stakeholders ---
  server.registerTool(
    "drd_list_stakeholders",
    {
      title: "List stakeholders",
      description: "List all initiative stakeholders. Optionally filter by initiativeId.",
      inputSchema: mcpWithWorkspace({ initiativeId: z.string().optional() })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const stakeholders = await prisma.stakeholder.findMany({
        where: args.initiativeId ? { initiativeId: args.initiativeId } : undefined,
        include: { initiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } }, owner: { select: userPublicSelect } } } },
        orderBy: { initiative: { title: "asc" } }
      });
      return textContent(JSON.stringify(stakeholders, null, 2));
    }
  );

  server.registerTool(
    "drd_create_stakeholder",
    {
      title: "Create stakeholder",
      description: "Add a stakeholder to an initiative.",
      inputSchema: mcpWithWorkspace({
        initiativeId: z.string().min(1),
        name: z.string().min(1),
        role: z.nativeEnum(StakeholderRole),
        type: z.nativeEnum(StakeholderType),
        organization: z.string().nullable().optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const init = await prisma.initiative.findUnique({ where: { id: body.initiativeId } });
      if (!init) throw new Error("Initiative not found in this workspace");
      const stakeholder = await prisma.stakeholder.create({
        data: {
          initiativeId: body.initiativeId,
          name: body.name,
          role: body.role,
          type: body.type,
          organization: body.organization ?? null
        }
      });
      return textContent(JSON.stringify(stakeholder, null, 2));
    }
  );

  server.registerTool(
    "drd_update_stakeholder",
    {
      title: "Update stakeholder",
      description: "Update stakeholder fields by ID.",
      inputSchema: mcpWithWorkspace({
        id: z.string(),
        name: z.string().min(1).optional(),
        role: z.nativeEnum(StakeholderRole).optional(),
        type: z.nativeEnum(StakeholderType).optional(),
        organization: z.string().nullable().optional()
      })
    },
    async ({ id, workspaceSlug, ...body }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const existing = await prisma.stakeholder.findUnique({ where: { id } });
      if (!existing) throw new Error("Stakeholder not found");
      const stakeholder = await prisma.stakeholder.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.role !== undefined && { role: body.role }),
          ...(body.type !== undefined && { type: body.type }),
          ...(body.organization !== undefined && { organization: body.organization })
        }
      });
      return textContent(JSON.stringify(stakeholder, null, 2));
    }
  );

  server.registerTool(
    "drd_delete_stakeholder",
    {
      title: "Delete stakeholder",
      description: "Delete a stakeholder by ID.",
      inputSchema: mcpWithWorkspace({ id: z.string() })
    },
    async ({ id, workspaceSlug }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const existing = await prisma.stakeholder.findUnique({ where: { id } });
      if (!existing) throw new Error("Stakeholder not found");
      await prisma.stakeholder.delete({ where: { id } });
      return textContent(JSON.stringify({ ok: true, deletedId: id }, null, 2));
    }
  );

  server.registerTool(
    "drd_create_milestone",
    {
      title: "Create milestone",
      description: "Add a milestone to an initiative.",
      inputSchema: mcpWithWorkspace({
        initiativeId: z.string().min(1),
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        status: z.nativeEnum(MilestoneStatus).optional(),
        targetDate: z.string().nullable().optional(),
        ownerId: z.string().nullable().optional(),
        sequence: z.number().int().optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { userId, role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const init = await prisma.initiative.findUnique({ where: { id: body.initiativeId } });
      if (!init) throw new Error("Initiative not found in this workspace");
      const ownerIdResolved =
        body.ownerId === undefined || body.ownerId === null
          ? null
          : await resolveOwnerIdForWorkspace(body.ownerId, userId, role, membershipRole, tenantId);
      const milestone = await prisma.initiativeMilestone.create({
        data: {
          initiativeId: body.initiativeId,
          title: body.title,
          description: body.description ?? null,
          status: body.status ?? MilestoneStatus.TODO,
          targetDate: body.targetDate ? new Date(body.targetDate) : null,
          ownerId: ownerIdResolved,
          sequence: body.sequence ?? 0
        },
        include: { owner: true }
      });
      return textContent(JSON.stringify(sanitizeUserFields(milestone), null, 2));
    }
  );

  server.registerTool(
    "drd_update_milestone",
    {
      title: "Update milestone",
      description: "Update milestone by ID.",
      inputSchema: mcpWithWorkspace({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        status: z.nativeEnum(MilestoneStatus).optional(),
        targetDate: z.string().nullable().optional(),
        ownerId: z.string().nullable().optional(),
        sequence: z.number().int().optional()
      })
    },
    async ({ id, workspaceSlug, ...body }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { userId, role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const existing = await prisma.initiativeMilestone.findUnique({ where: { id } });
      if (!existing) throw new Error("Milestone not found");
      const data: Record<string, unknown> = {};
      if (body.title !== undefined) data.title = body.title;
      if (body.description !== undefined) data.description = body.description;
      if (body.status !== undefined) data.status = body.status;
      if (body.targetDate !== undefined) data.targetDate = body.targetDate ? new Date(body.targetDate) : null;
      if (body.sequence !== undefined) data.sequence = body.sequence;
      if (body.ownerId !== undefined) {
        data.ownerId =
          body.ownerId === null
            ? null
            : await resolveOwnerIdForWorkspace(body.ownerId, userId, role, membershipRole, tenantId);
      }
      const milestone = await prisma.initiativeMilestone.update({
        where: { id },
        data,
        include: { owner: true }
      });
      return textContent(JSON.stringify(sanitizeUserFields(milestone), null, 2));
    }
  );

  server.registerTool(
    "drd_delete_milestone",
    {
      title: "Delete milestone",
      description: "Delete a milestone by ID.",
      inputSchema: mcpWithWorkspace({ id: z.string() })
    },
    async ({ id, workspaceSlug }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const existing = await prisma.initiativeMilestone.findUnique({ where: { id } });
      if (!existing) throw new Error("Milestone not found");
      await prisma.initiativeMilestone.delete({ where: { id } });
      return textContent(JSON.stringify({ ok: true, deletedId: id }, null, 2));
    }
  );

  server.registerTool(
    "drd_create_kpi",
    {
      title: "Create KPI",
      description: "Add a KPI to an initiative.",
      inputSchema: mcpWithWorkspace({
        initiativeId: z.string().min(1),
        title: z.string().min(1),
        targetValue: z.string().nullable().optional(),
        currentValue: z.string().nullable().optional(),
        unit: z.string().nullable().optional(),
        targetDate: z.string().nullable().optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const init = await prisma.initiative.findUnique({ where: { id: body.initiativeId } });
      if (!init) throw new Error("Initiative not found in this workspace");
      const kpi = await prisma.initiativeKPI.create({
        data: {
          initiativeId: body.initiativeId,
          title: body.title,
          targetValue: body.targetValue ?? null,
          currentValue: body.currentValue ?? null,
          unit: body.unit ?? null,
          targetDate: body.targetDate ? new Date(body.targetDate) : null
        }
      });
      return textContent(JSON.stringify(kpi, null, 2));
    }
  );

  server.registerTool(
    "drd_update_kpi",
    {
      title: "Update KPI",
      description: "Update KPI by ID.",
      inputSchema: mcpWithWorkspace({
        id: z.string(),
        title: z.string().min(1).optional(),
        targetValue: z.string().nullable().optional(),
        currentValue: z.string().nullable().optional(),
        unit: z.string().nullable().optional(),
        targetDate: z.string().nullable().optional()
      })
    },
    async ({ id, workspaceSlug, ...body }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const existing = await prisma.initiativeKPI.findUnique({ where: { id } });
      if (!existing) throw new Error("KPI not found");
      const kpi = await prisma.initiativeKPI.update({
        where: { id },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.targetValue !== undefined && { targetValue: body.targetValue }),
          ...(body.currentValue !== undefined && { currentValue: body.currentValue }),
          ...(body.unit !== undefined && { unit: body.unit }),
          ...(body.targetDate !== undefined && { targetDate: body.targetDate ? new Date(body.targetDate) : null })
        }
      });
      return textContent(JSON.stringify(kpi, null, 2));
    }
  );

  server.registerTool(
    "drd_delete_kpi",
    {
      title: "Delete KPI",
      description: "Delete a KPI by ID.",
      inputSchema: mcpWithWorkspace({ id: z.string() })
    },
    async ({ id, workspaceSlug }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const existing = await prisma.initiativeKPI.findUnique({ where: { id } });
      if (!existing) throw new Error("KPI not found");
      await prisma.initiativeKPI.delete({ where: { id } });
      return textContent(JSON.stringify({ ok: true, deletedId: id }, null, 2));
    }
  );

  // --- Timeline (read-only) ---
  server.registerTool(
    "drd_timeline_calendar",
    {
      title: "Timeline calendar",
      description: "Get initiatives as calendar items (id, title, dates, domain, owner) for timeline/calendar view.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const initiatives = await prisma.initiative.findMany({
        include: { domain: true, owner: true },
        orderBy: { targetDate: "asc" }
      });
      const items = initiatives.map((i) => ({
        id: i.id,
        title: i.title,
        startDate: i.startDate,
        targetDate: i.targetDate,
        milestoneDate: i.milestoneDate,
        domain: i.domain.name,
        domainId: i.domainId,
        domainColor: i.domain.color,
        owner: i.owner?.name ?? null,
        dateConfidence: i.dateConfidence
      }));
      return textContent(JSON.stringify({ items }, null, 2));
    }
  );

  server.registerTool(
    "drd_timeline_gantt",
    {
      title: "Timeline Gantt",
      description: "Get initiatives as Gantt tasks (id, title, dates, domain, progress, dependency ids). Dependencies only include targets in the same workspace.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const tenantId = getTenantContext()!.tenantId;
      const initiatives = await prisma.initiative.findMany({
        include: {
          domain: true,
          owner: true,
          outgoingDeps: { include: { toInitiative: { select: { id: true, tenantId: true } } } }
        },
        orderBy: { startDate: "asc" }
      });
      const tasks = initiatives.map((i) => ({
        id: i.id,
        title: i.title,
        startDate: i.startDate,
        targetDate: i.targetDate,
        domain: i.domain.name,
        domainColor: i.domain.color,
        owner: i.owner?.name ?? null,
        progress:
          i.status === "DONE"
            ? 100
            : i.status === "IN_PROGRESS"
              ? 60
              : i.status === "PLANNED"
                ? 30
                : i.status === "BLOCKED"
                  ? 10
                  : 0,
        dependencies: i.outgoingDeps
          .filter((d) => d.toInitiative?.tenantId === tenantId)
          .map((d) => d.toInitiativeId)
      }));
      return textContent(JSON.stringify({ tasks }, null, 2));
    }
  );

  // --- Campaigns (read-only list + get) ---
  const campaignInclude = {
    owner: true,
    assets: { include: { persona: true }, orderBy: { createdAt: "asc" as const } },
    links: {
      include: {
        initiative: { include: { domain: true } },
        feature: true,
        account: true,
        partner: true
      }
    }
  };

  server.registerTool(
    "drd_list_campaigns",
    {
      title: "List campaigns",
      description: "List all campaigns with assets and links to initiatives/features/accounts/partners.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const campaigns = await prisma.campaign.findMany({
        include: campaignInclude,
        orderBy: { createdAt: "desc" }
      });
      return textContent(JSON.stringify(sanitizeUserFields(campaigns), null, 2));
    }
  );

  server.registerTool(
    "drd_get_campaign",
    {
      title: "Get campaign by ID",
      description: "Get a single campaign by ID with assets and links.",
      inputSchema: mcpWithWorkspace({ id: z.string() })
    },
    async ({ id, workspaceSlug }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      getUserFromCtx(ctx);
      const campaign = await prisma.campaign.findUnique({ where: { id }, include: campaignInclude });
      if (!campaign) throw new Error("Campaign not found");
      return textContent(JSON.stringify(sanitizeUserFields(campaign), null, 2));
    }
  );

  server.registerTool(
    "drd_create_campaign",
    {
      title: "Create campaign",
      description: "Create a campaign. Requires workspace content write, global ADMIN or MARKETING (same as HTTP).",
      inputSchema: mcpWithWorkspace({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        type: z.nativeEnum(CampaignType),
        status: z.nativeEnum(CampaignStatus).optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        budget: z.number().nullable().optional(),
        ownerId: z.string().nullable().optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpTenantCampaignWrite(membershipRole, role);
      const bad = await findFirstUserIdNotInTenant(tenantId, [body.ownerId]);
      if (bad) throw new Error(`User is not a member of this workspace: ${bad}`);
      const campaign = await prisma.campaign.create({
        data: {
          name: body.name,
          description: body.description ?? null,
          type: body.type,
          status: body.status ?? CampaignStatus.DRAFT,
          startDate: body.startDate ? new Date(body.startDate) : null,
          endDate: body.endDate ? new Date(body.endDate) : null,
          budget: body.budget ?? null,
          ownerId: body.ownerId ?? null
        },
        include: campaignInclude
      });
      return textContent(JSON.stringify(sanitizeUserFields(campaign), null, 2));
    }
  );

  server.registerTool(
    "drd_update_campaign",
    {
      title: "Update campaign",
      description: "Update campaign by ID. Same RBAC as create.",
      inputSchema: mcpWithWorkspace({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        type: z.nativeEnum(CampaignType).optional(),
        status: z.nativeEnum(CampaignStatus).optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        budget: z.number().nullable().optional(),
        ownerId: z.string().nullable().optional()
      })
    },
    async ({ id, workspaceSlug, ...body }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      requireMcpTenantCampaignWrite(membershipRole, role);
      const existing = await prisma.campaign.findUnique({ where: { id } });
      if (!existing) throw new Error("Campaign not found");
      if (body.ownerId !== undefined) {
        const bad = await findFirstUserIdNotInTenant(tenantId, [body.ownerId]);
        if (bad) throw new Error(`User is not a member of this workspace: ${bad}`);
      }
      const campaign = await prisma.campaign.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.type !== undefined && { type: body.type }),
          ...(body.status !== undefined && { status: body.status }),
          ...(body.budget !== undefined && { budget: body.budget }),
          ...(body.ownerId !== undefined && { ownerId: body.ownerId }),
          ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
          ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null })
        },
        include: campaignInclude
      });
      return textContent(JSON.stringify(sanitizeUserFields(campaign), null, 2));
    }
  );

  server.registerTool(
    "drd_delete_campaign",
    {
      title: "Delete campaign",
      description: "Delete campaign by ID. Same RBAC as create.",
      inputSchema: mcpWithWorkspace({ id: z.string() })
    },
    async ({ id, workspaceSlug }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpTenantCampaignWrite(membershipRole, role);
      const existing = await prisma.campaign.findUnique({ where: { id } });
      if (!existing) throw new Error("Campaign not found");
      await prisma.campaign.delete({ where: { id } });
      return textContent(JSON.stringify({ ok: true, deletedId: id }, null, 2));
    }
  );

  server.registerTool(
    "drd_create_campaign_link",
    {
      title: "Create campaign link",
      description: "Link a campaign to initiative, feature, account, and/or partner (at least one target).",
      inputSchema: mcpWithWorkspace({
        campaignId: z.string().min(1),
        initiativeId: z.string().nullable().optional(),
        featureId: z.string().nullable().optional(),
        accountId: z.string().nullable().optional(),
        partnerId: z.string().nullable().optional()
      })
    },
    async (body, ctx) => {
      assertMcpWorkspaceSlug(body.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpTenantCampaignWrite(membershipRole, role);
      const camp = await prisma.campaign.findUnique({ where: { id: body.campaignId } });
      if (!camp) throw new Error("Campaign not found in this workspace");
      const hasTarget =
        body.initiativeId != null || body.featureId != null || body.accountId != null || body.partnerId != null;
      if (!hasTarget) throw new Error("Provide at least one of initiativeId, featureId, accountId, partnerId");
      if (body.initiativeId) {
        const i = await prisma.initiative.findUnique({ where: { id: body.initiativeId } });
        if (!i) throw new Error("Initiative not found in this workspace");
      }
      if (body.featureId) {
        const f = await prisma.feature.findUnique({ where: { id: body.featureId } });
        if (!f) throw new Error("Feature not found in this workspace");
      }
      if (body.accountId) {
        const a = await prisma.account.findUnique({ where: { id: body.accountId } });
        if (!a) throw new Error("Account not found in this workspace");
      }
      if (body.partnerId) {
        const p = await prisma.partner.findUnique({ where: { id: body.partnerId } });
        if (!p) throw new Error("Partner not found in this workspace");
      }
      const link = await prisma.campaignLink.create({
        data: {
          campaignId: body.campaignId,
          initiativeId: body.initiativeId ?? null,
          featureId: body.featureId ?? null,
          accountId: body.accountId ?? null,
          partnerId: body.partnerId ?? null
        },
        include: {
          campaign: true,
          initiative: { include: { domain: true } },
          feature: true,
          account: true,
          partner: true
        }
      });
      return textContent(JSON.stringify(sanitizeUserFields(link), null, 2));
    }
  );

  server.registerTool(
    "drd_delete_campaign_link",
    {
      title: "Delete campaign link",
      description: "Delete a campaign link by ID.",
      inputSchema: mcpWithWorkspace({ id: z.string() })
    },
    async ({ id, workspaceSlug }, ctx) => {
      assertMcpWorkspaceSlug(workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpTenantCampaignWrite(membershipRole, role);
      const existing = await prisma.campaignLink.findUnique({ where: { id } });
      if (!existing) throw new Error("Campaign link not found");
      await prisma.campaignLink.delete({ where: { id } });
      return textContent(JSON.stringify({ ok: true, deletedId: id }, null, 2));
    }
  );

  server.registerTool(
    "drd_list_assets",
    {
      title: "List assets",
      description: "List all campaign assets. Optionally filter by campaignId.",
      inputSchema: mcpWithWorkspace({ campaignId: z.string().optional() })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const assets = await prisma.asset.findMany({
        where: args.campaignId ? { campaignId: args.campaignId } : undefined,
        include: { persona: true, campaign: true },
        orderBy: { createdAt: "asc" }
      });
      return textContent(JSON.stringify(assets, null, 2));
    }
  );

  server.registerTool(
    "drd_list_campaign_links",
    {
      title: "List campaign links",
      description: "Links between campaigns and initiatives/features/accounts/partners. Optionally filter by campaignId.",
      inputSchema: mcpWithWorkspace({ campaignId: z.string().optional() })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const links = await prisma.campaignLink.findMany({
        where: args.campaignId ? { campaignId: args.campaignId } : undefined,
        include: {
          campaign: true,
          initiative: { include: { domain: true } },
          feature: true,
          account: true,
          partner: true
        },
        orderBy: { id: "asc" }
      });
      return textContent(JSON.stringify(links, null, 2));
    }
  );

  // --- Structure reorder, execution boards, search (Tier 2) ---
  server.registerTool(
    "drd_reorder_initiatives",
    {
      title: "Reorder initiatives",
      description:
        "Update domainId and sortOrder for one or more initiatives. Each initiative must be editable by the caller (owner, RACI assignee, or workspace OWNER/ADMIN). Requires workspace content write.",
      inputSchema: mcpWithWorkspace({ positions: updatePositionsSchema.min(1) })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { userId, role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      for (const u of args.positions) {
        const ok = await canUserEditInitiativeForMcp(userId, role, membershipRole, u.id);
        if (!ok) throw new Error(`Forbidden: cannot reorder or move initiative ${u.id}`);
      }
      await prisma.$transaction(
        args.positions.map((u) =>
          prisma.initiative.update({
            where: { id: u.id },
            data: { domainId: u.domainId, sortOrder: u.sortOrder }
          })
        )
      );
      return textContent(JSON.stringify({ ok: true }, null, 2));
    }
  );

  server.registerTool(
    "drd_reorder_features",
    {
      title: "Reorder features in an initiative",
      description:
        "Sets sortOrder for every feature in one initiative. Payload must list each feature id under that initiative exactly once (same rules as POST /api/features/reorder). Requires workspace content write.",
      inputSchema: mcpWithWorkspace({ items: featureReorderSchema.min(1) })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const parsed = args.items;
      const payloadIds = parsed.map((u) => u.id);
      if (new Set(payloadIds).size !== payloadIds.length) {
        throw new Error("Duplicate feature ids in reorder payload");
      }
      const first = await prisma.feature.findUnique({
        where: { id: parsed[0]!.id },
        select: { initiativeId: true }
      });
      if (!first) throw new Error("Unknown feature");
      const siblings = await prisma.feature.findMany({
        where: { initiativeId: first.initiativeId },
        select: { id: true }
      });
      const expected = new Set(siblings.map((s) => s.id));
      if (expected.size !== payloadIds.length || !payloadIds.every((id) => expected.has(id))) {
        throw new Error("Payload must list every feature in the initiative exactly once");
      }
      await prisma.$transaction(
        parsed.map((u) =>
          prisma.feature.update({
            where: { id: u.id },
            data: { sortOrder: u.sortOrder }
          })
        )
      );
      return textContent(JSON.stringify({ ok: true }, null, 2));
    }
  );

  server.registerTool(
    "drd_reorder_requirements",
    {
      title: "Reorder requirements in a feature",
      description:
        "Sets sortOrder for every requirement under one feature. Payload must list each requirement id for that feature exactly once. Requires workspace content write.",
      inputSchema: mcpWithWorkspace({ items: requirementReorderSchema.min(1) })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const parsed = args.items;
      const payloadIds = parsed.map((u) => u.id);
      if (new Set(payloadIds).size !== payloadIds.length) {
        throw new Error("Duplicate requirement ids in reorder payload");
      }
      const first = await prisma.requirement.findUnique({
        where: { id: parsed[0]!.id },
        select: { featureId: true }
      });
      if (!first) throw new Error("Unknown requirement");
      const siblings = await prisma.requirement.findMany({
        where: { featureId: first.featureId },
        select: { id: true }
      });
      const expected = new Set(siblings.map((s) => s.id));
      if (expected.size !== payloadIds.length || !payloadIds.every((id) => expected.has(id))) {
        throw new Error("Payload must list every requirement in the feature exactly once");
      }
      await prisma.$transaction(
        parsed.map((u) =>
          prisma.requirement.update({
            where: { id: u.id },
            data: { sortOrder: u.sortOrder }
          })
        )
      );
      return textContent(JSON.stringify({ ok: true }, null, 2));
    }
  );

  server.registerTool(
    "drd_set_execution_layout",
    {
      title: "Set execution board layout for a product",
      description:
        "Assigns every requirement for a product to execution columns and executionSortOrder (same semantics as POST /api/requirements/execution-layout). Requires workspace content write.",
      inputSchema: z.object({ workspaceSlug: MCP_WORKSPACE_SLUG }).merge(executionBoardLayoutSchema)
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      const { productId, columns } = args;
      const flatIds = columns.flatMap((c) => c.requirementIds);
      if (new Set(flatIds).size !== flatIds.length) {
        throw new Error("Duplicate requirement ids in layout");
      }
      const boards = await prisma.executionBoard.findMany({
        where: { productId },
        select: { columns: { select: { id: true } } }
      });
      const validColumnIds = new Set(boards.flatMap((b) => b.columns.map((c) => c.id)));
      for (const col of columns) {
        if (col.executionColumnId !== null && !validColumnIds.has(col.executionColumnId)) {
          throw new Error("Unknown execution column for this product");
        }
      }
      const productReqs = await prisma.requirement.findMany({
        where: { feature: { initiative: { productId } } },
        select: { id: true, featureId: true, executionColumnId: true }
      });
      const expected = new Set(productReqs.map((r) => r.id));
      if (flatIds.length !== expected.size || !flatIds.every((id) => expected.has(id))) {
        throw new Error("Layout must list every requirement for this product exactly once");
      }
      const reqById = new Map(productReqs.map((r) => [r.id, r]));
      await prisma.$transaction(async () => {
        for (const col of columns) {
          const targetColId = col.executionColumnId;
          for (let i = 0; i < col.requirementIds.length; i++) {
            const reqId = col.requirementIds[i]!;
            const row = reqById.get(reqId)!;
            const prevCol = row.executionColumnId;
            const data: Prisma.RequirementUncheckedUpdateInput = { executionSortOrder: i };
            if (prevCol !== targetColId) {
              if (targetColId === null) {
                data.executionColumnId = null;
              } else {
                const applied = await applyExecutionColumn(row.featureId, targetColId);
                data.executionColumnId = applied.executionColumnId;
                if (applied.status !== undefined) data.status = applied.status;
                if (applied.isDone !== undefined) data.isDone = applied.isDone;
              }
            }
            await prisma.requirement.update({
              where: { id: reqId },
              data
            });
          }
        }
      });
      return textContent(JSON.stringify({ ok: true }, null, 2));
    }
  );

  server.registerTool(
    "drd_list_execution_boards",
    {
      title: "List execution boards for a product",
      description: "Returns boards and columns for the given productId (read-only).",
      inputSchema: mcpWithWorkspace({ productId: z.string().min(1) })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const product = await prisma.product.findUnique({ where: { id: args.productId } });
      if (!product) throw new Error("Product not found");
      const boards = await prisma.executionBoard.findMany({
        where: { productId: args.productId },
        include: executionBoardListInclude,
        orderBy: { createdAt: "asc" }
      });
      return textContent(JSON.stringify(boards, null, 2));
    }
  );

  server.registerTool(
    "drd_create_execution_board",
    {
      title: "Create execution board",
      description:
        "Create an execution board for a product. Optional columns; otherwise default backlog/progress/testing/done columns are created. Requires workspace OWNER or ADMIN.",
      inputSchema: mcpWithWorkspace({ productId: z.string().min(1) }).merge(createBoardSchema)
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const { productId, workspaceSlug: _, ...rest } = args;
      const parsed = createBoardSchema.safeParse(rest);
      if (!parsed.success) throw new Error(parsed.error.message);
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error("Product not found");
      const { columns: colInput, ...boardFields } = parsed.data;
      const defaultColumns =
        colInput ??
        [
          { name: "Backlog", sortOrder: 0, mappedStatus: TaskStatus.NOT_STARTED, isDefault: true },
          { name: "In progress", sortOrder: 1, mappedStatus: TaskStatus.IN_PROGRESS, isDefault: false },
          { name: "Testing", sortOrder: 2, mappedStatus: TaskStatus.TESTING, isDefault: false },
          { name: "Done", sortOrder: 3, mappedStatus: TaskStatus.DONE, isDefault: false }
        ];
      const board = await prisma.$transaction(async (tx) => {
        if (parsed.data.isDefault) {
          await tx.executionBoard.updateMany({
            where: { productId },
            data: { isDefault: false }
          });
        }
        const created = await tx.executionBoard.create({
          data: {
            productId,
            name: boardFields.name,
            provider: boardFields.provider,
            isDefault: boardFields.isDefault,
            externalRef: boardFields.externalRef ?? null,
            ...(boardFields.config !== undefined
              ? {
                  config:
                    boardFields.config === null
                      ? Prisma.JsonNull
                      : (boardFields.config as Prisma.InputJsonValue)
                }
              : {}),
            columns: {
              create: defaultColumns.map((c) => ({
                name: c.name,
                sortOrder: c.sortOrder,
                mappedStatus: c.mappedStatus,
                isDefault: c.isDefault,
                externalRef: c.externalRef ?? null
              }))
            }
          },
          include: executionBoardListInclude
        });
        const defaultCol = created.columns.find((c) => c.isDefault);
        if (defaultCol) {
          await tx.executionColumn.updateMany({
            where: { boardId: created.id, id: { not: defaultCol.id } },
            data: { isDefault: false }
          });
        }
        return created;
      });
      return textContent(JSON.stringify(board, null, 2));
    }
  );

  server.registerTool(
    "drd_update_execution_board",
    {
      title: "Update execution board",
      description: "Update board metadata (name, default flag, provider, sync state, config). Requires workspace OWNER or ADMIN.",
      inputSchema: mcpWithWorkspace({ boardId: z.string().min(1) }).merge(updateBoardSchema)
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const { boardId, workspaceSlug: _, ...rest } = args;
      const parsed = updateBoardSchema.safeParse(rest);
      if (!parsed.success) throw new Error(parsed.error.message);
      const existing = await prisma.executionBoard.findUnique({ where: { id: boardId } });
      if (!existing) throw new Error("Board not found");
      const data: Prisma.ExecutionBoardUpdateInput = {};
      if (parsed.data.name !== undefined) data.name = parsed.data.name;
      if (parsed.data.provider !== undefined) data.provider = parsed.data.provider;
      if (parsed.data.isDefault !== undefined) data.isDefault = parsed.data.isDefault;
      if (parsed.data.externalRef !== undefined) data.externalRef = parsed.data.externalRef;
      if (parsed.data.syncState !== undefined) data.syncState = parsed.data.syncState;
      if (parsed.data.config !== undefined) {
        data.config =
          parsed.data.config === null ? Prisma.JsonNull : (parsed.data.config as Prisma.InputJsonValue);
      }
      const board = await prisma.$transaction(async (tx) => {
        if (parsed.data.isDefault === true) {
          await tx.executionBoard.updateMany({
            where: { productId: existing.productId, id: { not: boardId } },
            data: { isDefault: false }
          });
        }
        return tx.executionBoard.update({
          where: { id: boardId },
          data,
          include: executionBoardListInclude
        });
      });
      return textContent(JSON.stringify(board, null, 2));
    }
  );

  server.registerTool(
    "drd_delete_execution_board",
    {
      title: "Delete execution board",
      description: "Deletes a board by id. Requires workspace OWNER or ADMIN.",
      inputSchema: mcpWithWorkspace({ boardId: z.string().min(1) })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const existing = await prisma.executionBoard.findUnique({ where: { id: args.boardId } });
      if (!existing) throw new Error("Board not found");
      await prisma.executionBoard.delete({ where: { id: args.boardId } });
      return textContent(JSON.stringify({ ok: true, deletedId: args.boardId }, null, 2));
    }
  );

  server.registerTool(
    "drd_create_execution_column",
    {
      title: "Create execution column",
      description: "Add a column to an execution board. Requires workspace OWNER or ADMIN.",
      inputSchema: mcpWithWorkspace({ boardId: z.string().min(1) }).merge(columnInputSchema)
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const { boardId, workspaceSlug: _, ...rest } = args;
      const parsed = columnInputSchema.safeParse(rest);
      if (!parsed.success) throw new Error(parsed.error.message);
      const board = await prisma.executionBoard.findUnique({ where: { id: boardId } });
      if (!board) throw new Error("Board not found");
      const column = await prisma.$transaction(async (tx) => {
        const created = await tx.executionColumn.create({
          data: {
            boardId,
            name: parsed.data.name,
            sortOrder: parsed.data.sortOrder,
            mappedStatus: parsed.data.mappedStatus,
            isDefault: parsed.data.isDefault,
            externalRef: parsed.data.externalRef ?? null
          }
        });
        if (parsed.data.isDefault) {
          await ensureSingleDefaultExecutionColumn(boardId, created.id);
        }
        return created;
      });
      return textContent(JSON.stringify(column, null, 2));
    }
  );

  server.registerTool(
    "drd_update_execution_column",
    {
      title: "Update execution column",
      description: "Update column fields on an execution column. Requires workspace OWNER or ADMIN.",
      inputSchema: mcpWithWorkspace({ columnId: z.string().min(1) }).merge(updateColumnSchema)
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const { columnId, workspaceSlug: _, ...rest } = args;
      const parsed = updateColumnSchema.safeParse(rest);
      if (!parsed.success) throw new Error(parsed.error.message);
      const existing = await prisma.executionColumn.findUnique({ where: { id: columnId } });
      if (!existing) throw new Error("Column not found");
      const column = await prisma.$transaction(async (tx) => {
        const updated = await tx.executionColumn.update({
          where: { id: columnId },
          data: {
            ...(parsed.data.name !== undefined && { name: parsed.data.name }),
            ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
            ...(parsed.data.mappedStatus !== undefined && { mappedStatus: parsed.data.mappedStatus }),
            ...(parsed.data.isDefault !== undefined && { isDefault: parsed.data.isDefault }),
            ...(parsed.data.externalRef !== undefined && { externalRef: parsed.data.externalRef })
          }
        });
        if (parsed.data.isDefault === true) {
          await ensureSingleDefaultExecutionColumn(existing.boardId, columnId);
        }
        return updated;
      });
      return textContent(JSON.stringify(column, null, 2));
    }
  );

  server.registerTool(
    "drd_delete_execution_column",
    {
      title: "Delete execution column",
      description: "Delete an execution column by id. Requires workspace OWNER or ADMIN.",
      inputSchema: mcpWithWorkspace({ columnId: z.string().min(1) })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const existing = await prisma.executionColumn.findUnique({ where: { id: args.columnId } });
      if (!existing) throw new Error("Column not found");
      await prisma.executionColumn.delete({ where: { id: args.columnId } });
      return textContent(JSON.stringify({ ok: true, deletedId: args.columnId }, null, 2));
    }
  );

  server.registerTool(
    "drd_reorder_execution_columns",
    {
      title: "Reorder execution columns",
      description:
        "Sets sortOrder for every column on a board; payload must list each column id exactly once. Requires workspace OWNER or ADMIN.",
      inputSchema: mcpWithWorkspace({ boardId: z.string().min(1), order: columnReorderSchema.min(1) })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { role } = getUserFromCtx(ctx);
      const { membershipRole } = getTenantContext()!;
      requireMcpWorkspaceStructureWrite(membershipRole, role);
      const board = await prisma.executionBoard.findUnique({ where: { id: args.boardId } });
      if (!board) throw new Error("Board not found");
      const cols = await prisma.executionColumn.findMany({
        where: { boardId: args.boardId },
        select: { id: true }
      });
      const expected = new Set(cols.map((c) => c.id));
      const payloadIds = args.order.map((r) => r.id);
      if (expected.size !== payloadIds.length || !payloadIds.every((id) => expected.has(id))) {
        throw new Error("Payload must list every column on the board exactly once");
      }
      await prisma.$transaction(
        args.order.map((u) =>
          prisma.executionColumn.update({
            where: { id: u.id },
            data: { sortOrder: u.sortOrder }
          })
        )
      );
      return textContent(JSON.stringify({ ok: true }, null, 2));
    }
  );

  server.registerTool(
    "drd_search_initiatives",
    {
      title: "Search initiatives",
      description:
        "Tenant-scoped search on initiative title and description (case-insensitive contains). Returns a bounded page (limit max 100) plus hasMore.",
      inputSchema: mcpWithWorkspace(mcpSearchPaginationShape)
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const mode = Prisma.QueryMode.insensitive;
      const take = args.limit + 1;
      const rows = await prisma.initiative.findMany({
        where: {
          OR: [
            { title: { contains: args.query, mode } },
            { description: { contains: args.query, mode } }
          ]
        },
        take,
        skip: args.offset,
        orderBy: [{ domain: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          domain: true,
          product: { select: { id: true, name: true, slug: true } },
          owner: true
        }
      });
      const hasMore = rows.length > args.limit;
      const items = rows.slice(0, args.limit);
      return textContent(
        JSON.stringify(
          {
            items: sanitizeUserFields(items),
            limit: args.limit,
            offset: args.offset,
            hasMore
          },
          null,
          2
        )
      );
    }
  );

  server.registerTool(
    "drd_search_features",
    {
      title: "Search features",
      description:
        "Tenant-scoped search on feature title and description (case-insensitive contains). Bounded pagination (limit max 100).",
      inputSchema: mcpWithWorkspace(mcpSearchPaginationShape)
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const mode = Prisma.QueryMode.insensitive;
      const take = args.limit + 1;
      const rows = await prisma.feature.findMany({
        where: {
          OR: [
            { title: { contains: args.query, mode } },
            { description: { contains: args.query, mode } }
          ]
        },
        take,
        skip: args.offset,
        orderBy: [{ initiativeId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          initiative: { select: { id: true, title: true, productId: true } },
          owner: true
        }
      });
      const hasMore = rows.length > args.limit;
      const items = rows.slice(0, args.limit);
      return textContent(
        JSON.stringify(
          {
            items: sanitizeUserFields(items),
            limit: args.limit,
            offset: args.offset,
            hasMore
          },
          null,
          2
        )
      );
    }
  );

  server.registerTool(
    "drd_search_requirements",
    {
      title: "Search requirements",
      description:
        "Tenant-scoped search on requirement title and description (case-insensitive contains). Bounded pagination (limit max 100).",
      inputSchema: mcpWithWorkspace(mcpSearchPaginationShape)
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const mode = Prisma.QueryMode.insensitive;
      const take = args.limit + 1;
      const rows = await prisma.requirement.findMany({
        where: {
          OR: [
            { title: { contains: args.query, mode } },
            { description: { contains: args.query, mode } }
          ]
        },
        take,
        skip: args.offset,
        orderBy: [{ featureId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          feature: {
            select: {
              id: true,
              title: true,
              initiativeId: true,
              initiative: { select: { id: true, title: true } }
            }
          },
          assignee: true
        }
      });
      const hasMore = rows.length > args.limit;
      const items = rows.slice(0, args.limit);
      return textContent(
        JSON.stringify(
          {
            items: sanitizeUserFields(items),
            limit: args.limit,
            offset: args.offset,
            hasMore
          },
          null,
          2
        )
      );
    }
  );

  // --- Ontology / agent brief (Tymio) ---
  server.registerTool(
    "tymio_get_coding_agent_guide",
    {
      title: "Get Tymio coding agent playbook (Markdown)",
      description:
        "Returns the full docs/CODING_AGENT_TYMIO.md: how to use Tymio via MCP and UI, as-is to structured work, and feature lifecycle. Call at session start when automating this hub.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const md = await readCodingAgentGuide();
      return textContent(md);
    }
  );

  server.registerTool(
    "tymio_get_agent_brief",
    {
      title: "Get compiled agent capability brief",
      description:
        "Returns the hub capability ontology as Markdown or JSON. Use before proposing new features. mode=compact (ACTIVE only) or full (ACTIVE+DRAFT).",
      inputSchema: mcpWithWorkspace({
        mode: z.enum(["compact", "full"]).default("compact"),
        format: z.enum(["md", "json"]).default("md")
      })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const mode = args.mode as BriefMode;
      const caps = await loadCapabilitiesForBrief(mode);
      if (args.format === "json") {
        const { content } = compileBriefJson(mode, caps);
        return textContent(content);
      }
      const { content } = compileBriefMarkdown(mode, caps);
      return textContent(content);
    }
  );

  server.registerTool(
    "tymio_list_capabilities",
    {
      title: "List hub capabilities (ontology)",
      description: "List product capabilities with bindings. Optional status filter: ACTIVE, DRAFT, DEPRECATED.",
      inputSchema: mcpWithWorkspace({
        status: z.enum(["ACTIVE", "DRAFT", "DEPRECATED"]).optional()
      })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const capabilities = await prisma.capability.findMany({
        where: args.status ? { status: args.status } : undefined,
        include: { bindings: { orderBy: [{ bindingType: "asc" }, { bindingKey: "asc" }] } },
        orderBy: [{ sortOrder: "asc" }, { slug: "asc" }]
      });
      return textContent(JSON.stringify({ capabilities }, null, 2));
    }
  );

  server.registerTool(
    "tymio_get_capability",
    {
      title: "Get one capability by id or slug",
      description: "Fetch a single capability and its bindings.",
      inputSchema: mcpWithWorkspace({
        id: z.string().optional(),
        slug: z.string().optional()
      })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      if (!args.id && !args.slug) throw new Error("Provide id or slug");
      const cap = args.id
        ? await prisma.capability.findUnique({
            where: { id: args.id },
            include: { bindings: { orderBy: [{ bindingType: "asc" }, { bindingKey: "asc" }] } }
          })
        : await prisma.capability.findUnique({
            where: { slug: args.slug! },
            include: { bindings: { orderBy: [{ bindingType: "asc" }, { bindingKey: "asc" }] } }
          });
      if (!cap) return textContent(JSON.stringify({ error: "Not found" }));
      return textContent(JSON.stringify({ capability: cap }, null, 2));
    }
  );

  registerWorkspaceAtlasTools(server);
}
