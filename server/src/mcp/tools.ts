import { z } from "zod";
import { Horizon, Prisma, Priority, UserRole } from "@prisma/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../db.js";
import { initiativeInclude } from "../routes/serializers.js";

/** Only these user fields are exposed to MCP (so the AI can match user id). */
const userPublicSelect = { id: true, name: true, email: true, role: true } as const;

function textContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function getUserFromCtx(ctx: unknown): { userId: string; role: string } {
  const extra = (ctx as { authInfo?: { extra?: Record<string, unknown> } })?.authInfo?.extra;
  if (!extra?.userId) throw new Error("Not authenticated");
  return { userId: extra.userId as string, role: extra.role as string };
}

function requireRole(role: string, ...allowed: string[]) {
  if (role === UserRole.SUPER_ADMIN) return;
  if (!allowed.includes(role)) throw new Error(`Forbidden: requires ${allowed.join(" or ")}`);
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
    { title: "DrD API health check", description: "Check if the DrD Hub API is reachable.", inputSchema: z.object({}) },
    async () => textContent(JSON.stringify({ ok: true }))
  );

  // --- Meta ---
  server.registerTool(
    "drd_meta",
    { title: "Get DrD meta", description: "Get meta data: domains, products, accounts, partners, personas, revenue streams, users.", inputSchema: z.object({}) },
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
      const { role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.EDITOR);
      const initiative = await prisma.initiative.create({
        data: {
          title: body.title,
          domainId: body.domainId,
          productId: body.productId ?? null,
          description: body.description ?? null,
          ownerId: body.ownerId ?? null,
          priority: (body.priority as Priority) ?? "P2",
          horizon: (body.horizon as Horizon) ?? "NOW",
          status: (body.status as Prisma.EnumInitiativeStatusFieldUpdateOperationsInput["set"]) ?? "IDEA",
          commercialType: (body.commercialType as unknown as Prisma.EnumCommercialTypeFieldUpdateOperationsInput["set"]) ?? "CARE_QUALITY",
          isGap: body.isGap ?? false
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
        ownerId: z.string().optional(),
        priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
        horizon: z.enum(["NOW", "NEXT", "LATER"]).optional(),
        status: z.enum(["IDEA", "PLANNED", "IN_PROGRESS", "DONE", "BLOCKED"]).optional(),
        commercialType: z.string().optional(),
        isGap: z.boolean().optional()
      })
    },
    async ({ id, ...body }, ctx) => {
      const { role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.EDITOR);
      const data: Record<string, unknown> = {};
      if (body.title !== undefined) data.title = body.title;
      if (body.domainId !== undefined) data.domainId = body.domainId;
      if (body.productId !== undefined) data.productId = body.productId;
      if (body.description !== undefined) data.description = body.description;
      if (body.ownerId !== undefined) data.ownerId = body.ownerId;
      if (body.priority !== undefined) data.priority = body.priority;
      if (body.horizon !== undefined) data.horizon = body.horizon;
      if (body.status !== undefined) data.status = body.status;
      if (body.commercialType !== undefined) data.commercialType = body.commercialType;
      if (body.isGap !== undefined) data.isGap = body.isGap;
      const initiative = await prisma.initiative.update({ where: { id }, data, include: initiativeInclude });
      return textContent(JSON.stringify(sanitizeUserFields(initiative), null, 2));
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
    async (_args, ctx) => { getUserFromCtx(ctx); return textContent(JSON.stringify((await prisma.product.findMany({ orderBy: { sortOrder: "asc" } })), null, 2)); }
  );

  server.registerTool(
    "drd_create_product",
    {
      title: "Create product",
      description: "Create a new product (asset). Requires admin or super_admin role.",
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        sortOrder: z.number().int().optional()
      })
    },
    async (body, ctx) => {
      const { role } = getUserFromCtx(ctx);
      requireRole(role, UserRole.ADMIN, UserRole.SUPER_ADMIN);
      const product = await prisma.product.create({
        data: {
          name: body.name,
          description: body.description ?? null,
          sortOrder: body.sortOrder ?? 0
        }
      });
      return textContent(JSON.stringify(product, null, 2));
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

  // --- Features (read-only list) ---
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

  // --- Requirements (read-only list) ---
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
        include: { feature: { include: { initiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } } } } } } },
        orderBy: { createdAt: "asc" }
      });
      return textContent(JSON.stringify(requirements, null, 2));
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
}
