import { z } from "zod";
import { Horizon, Prisma, Priority, UserRole } from "@prisma/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../db.js";
import { initiativeInclude } from "../routes/serializers.js";

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
        prisma.user.findMany({ orderBy: { name: "asc" } }),
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
      return textContent(JSON.stringify(initiatives, null, 2));
    }
  );

  server.registerTool(
    "drd_get_initiative",
    { title: "Get initiative by ID", description: "Get a single initiative by its ID.", inputSchema: z.object({ id: z.string() }) },
    async ({ id }, ctx) => {
      getUserFromCtx(ctx);
      const initiative = await prisma.initiative.findUnique({ where: { id }, include: initiativeInclude });
      if (!initiative) throw new Error("Initiative not found");
      return textContent(JSON.stringify(initiative, null, 2));
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
      return textContent(JSON.stringify(initiative, null, 2));
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
      if (body.description !== undefined) data.description = body.description;
      if (body.ownerId !== undefined) data.ownerId = body.ownerId;
      if (body.priority !== undefined) data.priority = body.priority;
      if (body.horizon !== undefined) data.horizon = body.horizon;
      if (body.status !== undefined) data.status = body.status;
      if (body.commercialType !== undefined) data.commercialType = body.commercialType;
      if (body.isGap !== undefined) data.isGap = body.isGap;
      const initiative = await prisma.initiative.update({ where: { id }, data, include: initiativeInclude });
      return textContent(JSON.stringify(initiative, null, 2));
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
        include: { initiative: { select: { id: true, title: true, startDate: true, domain: { select: { id: true, name: true, color: true } }, owner: { select: { id: true, name: true } } } } },
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
        include: { initiative: { select: { id: true, title: true, domain: { select: { id: true, name: true, color: true } }, owner: { select: { id: true, name: true } } } } },
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
}
