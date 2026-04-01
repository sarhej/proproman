import { z } from "zod";
import {
  FeatureStatus,
  Horizon,
  Prisma,
  Priority,
  StoryType,
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
import { getTenantContext } from "../tenant/tenantContext.js";

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

function requireRole(role: string, ...allowed: string[]) {
  if (role === UserRole.SUPER_ADMIN) return;
  if (!allowed.includes(role)) throw new Error(`Forbidden: requires ${allowed.join(" or ")}`);
}

function resolveOwnerIdForCaller(
  requestedOwnerId: string | null | undefined,
  userId: string,
  role: string
): string {
  if (requestedOwnerId && requestedOwnerId !== userId && role !== UserRole.SUPER_ADMIN) {
    throw new Error("Forbidden: ownerId must match the authenticated user.");
  }
  return requestedOwnerId ?? userId;
}

function assertOwnerIdEditableByCaller(
  requestedOwnerId: string | null | undefined,
  userId: string,
  role: string
): void {
  if (requestedOwnerId && requestedOwnerId !== userId && role !== UserRole.SUPER_ADMIN) {
    throw new Error("Forbidden: ownerId must match the authenticated user.");
  }
}

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

export function registerTools(server: McpServer) {
  // --- Health ---
  server.registerTool(
    "drd_health",
    { title: "Tymio API health check", description: "Check if the Tymio hub API is reachable.", inputSchema: z.object({}) },
    async () => textContent(JSON.stringify({ ok: true }))
  );

  // --- Meta ---
  server.registerTool(
    "drd_meta",
    { title: "Get Tymio meta", description: "Get meta data: domains, products, accounts, partners, personas, revenue streams, users.", inputSchema: z.object({}) },
    async (_args, ctx) => {
      getUserFromCtx(ctx);
      const [domains, personas, revenueStreams, users, products, accounts, partners] = await Promise.all([
        prisma.domain.findMany({ orderBy: { sortOrder: "asc" } }),
        prisma.persona.findMany({ orderBy: { name: "asc" } }),
        prisma.revenueStream.findMany({ orderBy: { name: "asc" } }),
        prisma.user.findMany({ select: userPublicSelect, orderBy: { name: "asc" } }),
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
      inputSchema: z.object({
        domainId: z.string().optional(),
        ownerId: z.string().optional(),
        horizon: z.enum(["NOW", "NEXT", "LATER"]).optional(),
        priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
        isGap: z.boolean().optional()
      })
    },
    async (args, ctx) => {
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
    { title: "Get initiative by ID", description: "Get a single initiative by its ID.", inputSchema: z.object({ id: z.string() }) },
    async ({ id }, ctx) => {
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
      inputSchema: z.object({
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
      const { userId, role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.EDITOR);
      const initiative = await prisma.initiative.create({
        data: {
          title: body.title,
          domainId: body.domainId,
          productId: body.productId ?? null,
          description: body.description ?? null,
          ownerId: resolveOwnerIdForCaller(body.ownerId, userId, role),
          priority: (body.priority as Priority) ?? "P2",
          horizon: (body.horizon as Horizon) ?? "NOW",
          status: (body.status as Prisma.EnumInitiativeStatusFieldUpdateOperationsInput["set"]) ?? "IDEA",
          commercialType: (body.commercialType as unknown as Prisma.EnumCommercialTypeFieldUpdateOperationsInput["set"]) ?? "CARE_QUALITY",
          isGap: body.isGap ?? false,
          isEpic: Boolean(body.productId)
        },
        include: initiativeInclude
      });
      return textContent(JSON.stringify(sanitizeUserFields(initiative), null, 2));
    }
  );

  server.registerTool(
    "drd_update_initiative",
    {
      title: "Update initiative",
      description: "Update an existing initiative by ID.",
      inputSchema: z.object({
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
        isGap: z.boolean().optional()
      })
    },
    async ({ id, ...body }, ctx) => {
      const { userId, role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.EDITOR);
      const data: Record<string, unknown> = {};
      if (body.title !== undefined) data.title = body.title;
      if (body.domainId !== undefined) data.domainId = body.domainId;
      if (body.productId !== undefined) data.productId = body.productId;
      if (body.description !== undefined) data.description = body.description;
      if (body.notes !== undefined) data.notes = body.notes;
      if (body.ownerId !== undefined) {
        assertOwnerIdEditableByCaller(body.ownerId, userId, role);
        data.ownerId = body.ownerId;
      }
      if (body.priority !== undefined) data.priority = body.priority;
      if (body.horizon !== undefined) data.horizon = body.horizon;
      if (body.status !== undefined) data.status = body.status;
      if (body.commercialType !== undefined) data.commercialType = body.commercialType;
      if (body.isGap !== undefined) data.isGap = body.isGap;
      const initiative = await prisma.initiative.update({ where: { id }, data, include: initiativeInclude });
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
      description: "Set the Notes field on each Tymio demo hub epic (initiative) to the canonical implementation details for that epic. Use this so implementation details are tracked in the product (Product Explorer); open an epic and see Notes in the Details tab. No arguments.",
      inputSchema: z.object({})
    },
    async (_args, ctx) => {
      const { role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.EDITOR);
      const product = await prisma.product.findFirst({ where: { name: "Tymio demo hub" } });
      if (!product) throw new Error("Product 'Tymio demo hub' not found. Run db:populate-tymio-demo --workspace server first.");
      const initiatives = await prisma.initiative.findMany({ where: { productId: product.id } });
      const updated: string[] = [];
      for (const init of initiatives) {
        const notes = DR_HUB_EPIC_NOTES[init.title];
        if (!notes) continue;
        await prisma.initiative.update({ where: { id: init.id }, data: { notes } });
        updated.push(init.title);
      }
      return textContent(JSON.stringify({ ok: true, updated }, null, 2));
    }
  );

  server.registerTool(
    "drd_delete_initiative",
    { title: "Delete initiative", description: "Delete an initiative by ID.", inputSchema: z.object({ id: z.string() }) },
    async ({ id }, ctx) => {
      const { role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.EDITOR);
      await prisma.initiative.delete({ where: { id } });
      return textContent(JSON.stringify({ ok: true }));
    }
  );

  // --- Reference data (read-only) ---
  server.registerTool(
    "drd_list_domains",
    { title: "List domains", description: "List all domains.", inputSchema: z.object({}) },
    async (_args, ctx) => { getUserFromCtx(ctx); return textContent(JSON.stringify((await prisma.domain.findMany({ orderBy: { sortOrder: "asc" } })), null, 2)); }
  );

  server.registerTool(
    "drd_list_products",
    { title: "List products", description: "List all products (with hierarchy).", inputSchema: z.object({}) },
    async (_args, ctx) => {
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
      description: "Create a new product (asset). Requires admin or super_admin role.",
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        itemType: z.enum(["PRODUCT", "SYSTEM"]).optional()
      })
    },
    async (body, ctx) => {
      const { role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.SUPER_ADMIN);
      const product = await prisma.product.create({
        data: {
          name: body.name,
          description: body.description ?? null,
          sortOrder: body.sortOrder ?? 0,
          itemType: (body.itemType as TopLevelItemType) ?? TopLevelItemType.PRODUCT
        }
      });
      return textContent(JSON.stringify(product, null, 2));
    }
  );

  server.registerTool(
    "drd_update_product",
    {
      title: "Update product",
      description: "Update an existing product by ID.",
      inputSchema: z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        itemType: z.enum(["PRODUCT", "SYSTEM"]).optional()
      })
    },
    async ({ id, ...body }, ctx) => {
      const { role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.SUPER_ADMIN);
      const data: {
        name?: string;
        description?: string | null;
        sortOrder?: number;
        itemType?: TopLevelItemType;
      } = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.description !== undefined) data.description = body.description;
      if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
      if (body.itemType !== undefined) data.itemType = body.itemType as TopLevelItemType;
      const product = await prisma.product.update({ where: { id }, data });
      return textContent(JSON.stringify(product, null, 2));
    }
  );

  server.registerTool(
    "drd_get_product_tree",
    {
      title: "Get product tree",
      description: "Get a product with full hierarchy: initiatives (epics), features (stories), requirements (tasks). Optionally filter by productId; if omitted, returns first product by sortOrder.",
      inputSchema: z.object({ productId: z.string().optional() })
    },
    async (args, ctx) => {
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
    { title: "List personas", description: "List all personas.", inputSchema: z.object({}) },
    async (_args, ctx) => { getUserFromCtx(ctx); return textContent(JSON.stringify((await prisma.persona.findMany({ orderBy: { name: "asc" } })), null, 2)); }
  );

  server.registerTool(
    "drd_list_accounts",
    { title: "List accounts", description: "List all accounts.", inputSchema: z.object({}) },
    async (_args, ctx) => { getUserFromCtx(ctx); return textContent(JSON.stringify((await prisma.account.findMany({ orderBy: { name: "asc" } })), null, 2)); }
  );

  server.registerTool(
    "drd_list_partners",
    { title: "List partners", description: "List all partners.", inputSchema: z.object({}) },
    async (_args, ctx) => { getUserFromCtx(ctx); return textContent(JSON.stringify((await prisma.partner.findMany({ orderBy: { name: "asc" } })), null, 2)); }
  );

  server.registerTool(
    "drd_list_kpis",
    { title: "List KPIs", description: "List all initiative KPIs with their initiative context.", inputSchema: z.object({}) },
    async (_args, ctx) => {
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
    { title: "List milestones", description: "List all initiative milestones.", inputSchema: z.object({}) },
    async (_args, ctx) => {
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
    { title: "List demands", description: "List all demands (from accounts, partners, internal, compliance).", inputSchema: z.object({}) },
    async (_args, ctx) => {
      getUserFromCtx(ctx);
      const demands = await prisma.demand.findMany({ include: { account: true, partner: true }, orderBy: { createdAt: "desc" } });
      return textContent(JSON.stringify(demands, null, 2));
    }
  );

  server.registerTool(
    "drd_list_revenue_streams",
    { title: "List revenue streams", description: "List all revenue streams.", inputSchema: z.object({}) },
    async (_args, ctx) => { getUserFromCtx(ctx); return textContent(JSON.stringify((await prisma.revenueStream.findMany({ orderBy: { name: "asc" } })), null, 2)); }
  );

  // --- Features ---
  server.registerTool(
    "drd_list_features",
    {
      title: "List features",
      description: "List all features with initiative context. Optionally filter by initiativeId.",
      inputSchema: z.object({ initiativeId: z.string().optional() })
    },
    async (args, ctx) => {
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
      inputSchema: z.object({
        initiativeId: z.string(),
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        acceptanceCriteria: z.string().nullable().optional(),
        storyPoints: z.number().int().min(0).nullable().optional(),
        storyType: z.enum(["FUNCTIONAL", "BUG", "TECH_DEBT", "RESEARCH"]).nullable().optional(),
        ownerId: z.string().nullable().optional(),
        status: z.enum(["IDEA", "PLANNED", "IN_PROGRESS", "DONE"]).optional(),
        sortOrder: z.number().int().optional()
      })
    },
    async (body, ctx) => {
      const { userId, role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.EDITOR, UserRole.SUPER_ADMIN);
      const feature = await prisma.feature.create({
        data: {
          initiativeId: body.initiativeId,
          title: body.title,
          description: body.description ?? null,
          acceptanceCriteria: body.acceptanceCriteria ?? null,
          storyPoints: body.storyPoints ?? null,
          storyType: body.storyType ? (body.storyType as StoryType) : null,
          ownerId: resolveOwnerIdForCaller(body.ownerId, userId, role),
          status: (body.status as FeatureStatus) ?? FeatureStatus.IDEA,
          sortOrder: body.sortOrder ?? 0
        },
        include: { initiative: { select: { id: true, title: true } }, owner: true }
      });
      return textContent(JSON.stringify(feature, null, 2));
    }
  );

  server.registerTool(
    "drd_update_feature",
    {
      title: "Update feature",
      description: "Update an existing feature (user story) by ID.",
      inputSchema: z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        acceptanceCriteria: z.string().nullable().optional(),
        storyPoints: z.number().int().min(0).nullable().optional(),
        storyType: z.enum(["FUNCTIONAL", "BUG", "TECH_DEBT", "RESEARCH"]).nullable().optional(),
        ownerId: z.string().nullable().optional(),
        status: z.enum(["IDEA", "PLANNED", "IN_PROGRESS", "DONE"]).optional(),
        sortOrder: z.number().int().optional()
      })
    },
    async ({ id, ...body }, ctx) => {
      const { userId, role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.EDITOR, UserRole.SUPER_ADMIN);
      const data: Record<string, unknown> = {};
      if (body.title !== undefined) data.title = body.title;
      if (body.description !== undefined) data.description = body.description;
      if (body.acceptanceCriteria !== undefined) data.acceptanceCriteria = body.acceptanceCriteria;
      if (body.storyPoints !== undefined) data.storyPoints = body.storyPoints;
      if (body.storyType !== undefined) data.storyType = body.storyType;
      if (body.ownerId !== undefined) {
        assertOwnerIdEditableByCaller(body.ownerId, userId, role);
        data.ownerId = body.ownerId;
      }
      if (body.status !== undefined) data.status = body.status;
      if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
      const feature = await prisma.feature.update({
        where: { id },
        data,
        include: { initiative: { select: { id: true, title: true } }, owner: true }
      });
      return textContent(JSON.stringify(feature, null, 2));
    }
  );

  // --- Decisions (read-only list) ---
  server.registerTool(
    "drd_list_decisions",
    {
      title: "List decisions",
      description: "List all initiative decisions. Optionally filter by initiativeId.",
      inputSchema: z.object({ initiativeId: z.string().optional() })
    },
    async (args, ctx) => {
      getUserFromCtx(ctx);
      const decisions = await prisma.decision.findMany({
        where: args.initiativeId ? { initiativeId: args.initiativeId } : undefined,
        include: { initiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } }, owner: { select: userPublicSelect } } } },
        orderBy: { createdAt: "desc" }
      });
      return textContent(JSON.stringify(decisions, null, 2));
    }
  );

  // --- Risks (read-only list) ---
  server.registerTool(
    "drd_list_risks",
    {
      title: "List risks",
      description: "List all initiative risks with owner. Optionally filter by initiativeId.",
      inputSchema: z.object({ initiativeId: z.string().optional() })
    },
    async (args, ctx) => {
      getUserFromCtx(ctx);
      const risks = await prisma.risk.findMany({
        where: args.initiativeId ? { initiativeId: args.initiativeId } : undefined,
        include: { initiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } }, owner: { select: userPublicSelect } } }, owner: true },
        orderBy: { createdAt: "desc" }
      });
      return textContent(JSON.stringify(sanitizeUserFields(risks), null, 2));
    }
  );

  // --- Dependencies (read-only list) ---
  server.registerTool(
    "drd_list_dependencies",
    {
      title: "List dependencies",
      description: "List all initiative dependencies (from/to initiatives).",
      inputSchema: z.object({})
    },
    async (_args, ctx) => {
      getUserFromCtx(ctx);
      const deps = await prisma.dependency.findMany({
        include: {
          fromInitiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } } } },
          toInitiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } } } }
        }
      });
      return textContent(JSON.stringify(deps, null, 2));
    }
  );

  // --- Requirements ---
  server.registerTool(
    "drd_list_requirements",
    {
      title: "List requirements",
      description: "List all feature requirements with feature and initiative context. Optionally filter by featureId.",
      inputSchema: z.object({ featureId: z.string().optional() })
    },
    async (args, ctx) => {
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
      inputSchema: z.object(requirementTaskFields)
    },
    async (body, ctx) => {
      const { role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.EDITOR, UserRole.SUPER_ADMIN);
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

  server.registerTool(
    "drd_update_requirement",
    {
      title: "Update requirement",
      description: "Update an existing requirement (task) by ID. Supports full task payload: status, assigneeId, dueDate, estimate, labels, taskType, blockedReason, externalRef, metadata.",
      inputSchema: updateRequirementSchema
    },
    async (args, ctx) => {
      const { id, ...body } = updateRequirementSchema.parse(args);
      const { role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.EDITOR, UserRole.SUPER_ADMIN);
      const existing = await prisma.requirement.findUnique({
        where: { id },
        select: { featureId: true }
      });
      if (!existing) throw new Error("Requirement not found");
      const featureId = body.featureId ?? existing.featureId;
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

  server.registerTool(
    "drd_upsert_requirement",
    {
      title: "Upsert requirement",
      description: "Idempotent create-or-update a requirement (task): find by featureId and either externalRef or normalized title; if found, update with payload, else create. Use for imports to avoid duplicates.",
      inputSchema: upsertRequirementSchema
    },
    async (args, ctx) => {
      const body = upsertRequirementSchema.parse(args);
      const { role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.EDITOR, UserRole.SUPER_ADMIN);
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
        return textContent(JSON.stringify({ updated: true, requirement: sanitizeUserFields(requirement) }, null, 2));
      }
      const requirement = await prisma.requirement.create({
        data: createData,
        include: { feature: { select: { id: true, title: true, initiativeId: true } }, assignee: { select: userPublicSelect } }
      });
      return textContent(JSON.stringify({ created: true, requirement: sanitizeUserFields(requirement) }, null, 2));
    }
  );

  // --- Assignments (read-only list) ---
  server.registerTool(
    "drd_list_assignments",
    {
      title: "List assignments",
      description: "List all initiative assignments (user roles). Optionally filter by initiativeId.",
      inputSchema: z.object({ initiativeId: z.string().optional() })
    },
    async (args, ctx) => {
      getUserFromCtx(ctx);
      const assignments = await prisma.initiativeAssignment.findMany({
        where: args.initiativeId ? { initiativeId: args.initiativeId } : undefined,
        include: { user: true, initiative: { select: { id: true, title: true, domain: { select: { id: true, name: true } } } } },
        orderBy: [{ initiativeId: "asc" }, { role: "asc" }]
      });
      return textContent(JSON.stringify(sanitizeUserFields(assignments), null, 2));
    }
  );

  // --- Stakeholders (read-only list) ---
  server.registerTool(
    "drd_list_stakeholders",
    {
      title: "List stakeholders",
      description: "List all initiative stakeholders. Optionally filter by initiativeId.",
      inputSchema: z.object({ initiativeId: z.string().optional() })
    },
    async (args, ctx) => {
      getUserFromCtx(ctx);
      const stakeholders = await prisma.stakeholder.findMany({
        where: args.initiativeId ? { initiativeId: args.initiativeId } : undefined,
        include: { initiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } }, owner: { select: userPublicSelect } } } },
        orderBy: { initiative: { title: "asc" } }
      });
      return textContent(JSON.stringify(stakeholders, null, 2));
    }
  );

  // --- Timeline (read-only) ---
  server.registerTool(
    "drd_timeline_calendar",
    {
      title: "Timeline calendar",
      description: "Get initiatives as calendar items (id, title, dates, domain, owner) for timeline/calendar view.",
      inputSchema: z.object({})
    },
    async (_args, ctx) => {
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
      description: "Get initiatives as Gantt tasks (id, title, dates, domain, progress, dependency ids).",
      inputSchema: z.object({})
    },
    async (_args, ctx) => {
      getUserFromCtx(ctx);
      const initiatives = await prisma.initiative.findMany({
        include: { domain: true, owner: true, outgoingDeps: true },
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
        dependencies: i.outgoingDeps.map((d) => d.toInitiativeId)
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
      inputSchema: z.object({})
    },
    async (_args, ctx) => {
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
      inputSchema: z.object({ id: z.string() })
    },
    async ({ id }, ctx) => {
      getUserFromCtx(ctx);
      const campaign = await prisma.campaign.findUnique({ where: { id }, include: campaignInclude });
      if (!campaign) throw new Error("Campaign not found");
      return textContent(JSON.stringify(sanitizeUserFields(campaign), null, 2));
    }
  );

  server.registerTool(
    "drd_list_assets",
    {
      title: "List assets",
      description: "List all campaign assets. Optionally filter by campaignId.",
      inputSchema: z.object({ campaignId: z.string().optional() })
    },
    async (args, ctx) => {
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
      inputSchema: z.object({ campaignId: z.string().optional() })
    },
    async (args, ctx) => {
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

  // --- Ontology / agent brief (Tymio) ---
  server.registerTool(
    "tymio_get_coding_agent_guide",
    {
      title: "Get Tymio coding agent playbook (Markdown)",
      description:
        "Returns the full docs/CODING_AGENT_TYMIO.md: how to use Tymio via MCP and UI, as-is to structured work, and feature lifecycle. Call at session start when automating this hub.",
      inputSchema: z.object({})
    },
    async (_args, ctx) => {
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
      inputSchema: z.object({
        mode: z.enum(["compact", "full"]).default("compact"),
        format: z.enum(["md", "json"]).default("md")
      })
    },
    async (args, ctx) => {
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
      inputSchema: z.object({
        status: z.enum(["ACTIVE", "DRAFT", "DEPRECATED"]).optional()
      })
    },
    async (args, ctx) => {
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
      inputSchema: z.object({
        id: z.string().optional(),
        slug: z.string().optional()
      })
    },
    async (args, ctx) => {
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
}
