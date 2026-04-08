/**
 * Tymio MCP server (stdio) — exposes hub REST APIs as MCP tools for agents.
 * Set DRD_API_BASE_URL and DRD_API_KEY in the environment.
 */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { drdFetch, drdFetchText, getBaseUrl, hasApiKey } from "./api.js";
import { toolTextWithFeedback } from "./mcpFeedbackFooter.js";

const server = new McpServer({
  name: "tymio-hub",
  version: "1.0.0"
});

async function textContent(text: string) {
  return toolTextWithFeedback(getBaseUrl(), text);
}

// --- Health & meta (no auth required for health)
server.registerTool(
  "drd_health",
  {
    title: "Tymio API health check",
    description: "Check if the Tymio hub API is reachable.",
    inputSchema: z.object({})
  },
  async () => {
    const data = await drdFetch<{ ok: boolean }>("/api/health");
    return textContent(JSON.stringify(data));
  }
);

server.registerTool(
  "drd_meta",
  {
    title: "Get Tymio meta",
    description: "Get meta data: domains, products, accounts, partners, personas, revenue streams, users.",
    inputSchema: z.object({})
  },
  async () => {
    const data = await drdFetch<Record<string, unknown>>("/api/meta");
    return textContent(JSON.stringify(data, null, 2));
  }
);

// --- Initiatives
const listInitiativesSchema = z.object({
  domainId: z.string().optional(),
  ownerId: z.string().optional(),
  horizon: z.enum(["NOW", "NEXT", "LATER"]).optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  isGap: z.boolean().optional()
});

server.registerTool(
  "drd_list_initiatives",
  {
    title: "List initiatives",
    description: "List initiatives with optional filters: domainId, ownerId, horizon, priority, isGap.",
    inputSchema: listInitiativesSchema
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.domainId) params.set("domainId", args.domainId);
    if (args.ownerId) params.set("ownerId", args.ownerId);
    if (args.horizon) params.set("horizon", args.horizon);
    if (args.priority) params.set("priority", args.priority);
    if (args.isGap !== undefined) params.set("isGap", String(args.isGap));
    const data = await drdFetch<{ initiatives: unknown[] }>(`/api/initiatives?${params.toString()}`);
    return textContent(JSON.stringify(data.initiatives, null, 2));
  }
);

server.registerTool(
  "drd_get_initiative",
  {
    title: "Get initiative by ID",
    description: "Get a single initiative by its ID.",
    inputSchema: z.object({ id: z.string().describe("Initiative ID") })
  },
  async ({ id }) => {
    const data = await drdFetch<{ initiative: unknown }>(`/api/initiatives/${id}`);
    return textContent(JSON.stringify(data.initiative, null, 2));
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
  async (body) => {
    const data = await drdFetch<{ initiative: unknown }>("/api/initiatives", {
      method: "POST",
      body: JSON.stringify(body)
    });
    return textContent(JSON.stringify(data.initiative, null, 2));
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
  async ({ id, ...body }) => {
    const data = await drdFetch<{ initiative: unknown }>(`/api/initiatives/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    });
    return textContent(JSON.stringify(data.initiative, null, 2));
  }
);

server.registerTool(
  "drd_delete_initiative",
  {
    title: "Delete initiative",
    description: "Delete an initiative by ID.",
    inputSchema: z.object({ id: z.string() })
  },
  async ({ id }) => {
    await drdFetch(`/api/initiatives/${id}`, { method: "DELETE" });
    return textContent(JSON.stringify({ ok: true }));
  }
);

// --- Domains, products, personas
server.registerTool(
  "drd_list_domains",
  {
    title: "List domains",
    description: "List all domains.",
    inputSchema: z.object({})
  },
  async () => {
    const data = await drdFetch<{ domains: unknown[] }>("/api/domains");
    return textContent(JSON.stringify(data.domains, null, 2));
  }
);

server.registerTool(
  "drd_create_domain",
  {
    title: "Create domain",
    description: "Create a new domain (pillar). Requires workspace OWNER or ADMIN.",
    inputSchema: z.object({
      name: z.string().min(1),
      color: z.string().min(1),
      sortOrder: z.number().int().optional()
    })
  },
  async (body) => {
    const data = await drdFetch<{ domain: unknown }>("/api/domains", {
      method: "POST",
      body: JSON.stringify({
        name: body.name,
        color: body.color,
        sortOrder: body.sortOrder ?? 0
      })
    });
    return textContent(JSON.stringify(data.domain, null, 2));
  }
);

server.registerTool(
  "drd_list_products",
  {
    title: "List products",
    description: "List all products (with hierarchy).",
    inputSchema: z.object({})
  },
  async () => {
    const data = await drdFetch<{ products: unknown[] }>("/api/products");
    return textContent(JSON.stringify(data.products, null, 2));
  }
);

server.registerTool(
  "drd_list_personas",
  {
    title: "List personas",
    description: "List all personas.",
    inputSchema: z.object({})
  },
  async () => {
    const data = await drdFetch<{ personas: unknown[] }>("/api/personas");
    return textContent(JSON.stringify(data.personas, null, 2));
  }
);

server.registerTool(
  "drd_list_accounts",
  {
    title: "List accounts",
    description: "List all accounts.",
    inputSchema: z.object({})
  },
  async () => {
    const data = await drdFetch<{ accounts: unknown[] }>("/api/accounts");
    return textContent(JSON.stringify(data.accounts, null, 2));
  }
);

server.registerTool(
  "drd_list_partners",
  {
    title: "List partners",
    description: "List all partners.",
    inputSchema: z.object({})
  },
  async () => {
    const data = await drdFetch<{ partners: unknown[] }>("/api/partners");
    return textContent(JSON.stringify(data.partners, null, 2));
  }
);

// --- KPIs, milestones, stakeholders
server.registerTool(
  "drd_list_kpis",
  {
    title: "List KPIs",
    description: "List all initiative KPIs with their initiative context (title, domain, owner).",
    inputSchema: z.object({})
  },
  async () => {
    const data = await drdFetch<{ kpis: unknown[] }>("/api/kpis");
    return textContent(JSON.stringify(data.kpis, null, 2));
  }
);

server.registerTool(
  "drd_list_milestones",
  {
    title: "List milestones",
    description: "List all initiative milestones with their initiative context.",
    inputSchema: z.object({})
  },
  async () => {
    const data = await drdFetch<{ milestones: unknown[] }>("/api/milestones");
    return textContent(JSON.stringify(data.milestones, null, 2));
  }
);

server.registerTool(
  "drd_list_demands",
  {
    title: "List demands",
    description: "List all demands (from accounts, partners, internal, compliance).",
    inputSchema: z.object({})
  },
  async () => {
    const data = await drdFetch<{ demands: unknown[] }>("/api/demands");
    return textContent(JSON.stringify(data.demands, null, 2));
  }
);

server.registerTool(
  "drd_list_revenue_streams",
  {
    title: "List revenue streams",
    description: "List all revenue streams.",
    inputSchema: z.object({})
  },
  async () => {
    const data = await drdFetch<{ revenueStreams: unknown[] }>("/api/revenue-streams");
    return textContent(JSON.stringify(data.revenueStreams, null, 2));
  }
);

server.registerTool(
  "tymio_get_coding_agent_guide",
  {
    title: "Get Tymio coding agent playbook (Markdown)",
    description:
      "Full docs/CODING_AGENT_TYMIO.md: MCP usage, as-is to Tymio, feature lifecycle. Call at session start when automating this hub.",
    inputSchema: z.object({})
  },
  async () => {
    const md = await drdFetchText("/api/agent/coding-guide");
    return textContent(md);
  }
);

server.registerTool(
  "tymio_get_agent_brief",
  {
    title: "Get compiled agent capability brief",
    description:
      "Returns the hub capability ontology as Markdown or JSON. mode=compact|full, format=md|json.",
    inputSchema: z.object({
      mode: z.enum(["compact", "full"]).default("compact"),
      format: z.enum(["md", "json"]).default("md")
    })
  },
  async (args) => {
    const params = new URLSearchParams({ mode: args.mode, format: args.format });
    const q = params.toString();
    if (args.format === "md") {
      const text = await drdFetchText(`/api/ontology/brief?${q}`);
      return textContent(text);
    }
    const raw = await drdFetchText(`/api/ontology/brief?${q}`);
    try {
      const parsed = JSON.parse(raw) as unknown;
      return textContent(JSON.stringify(parsed, null, 2));
    } catch {
      return textContent(raw);
    }
  }
);

server.registerTool(
  "tymio_list_capabilities",
  {
    title: "List hub capabilities (ontology)",
    description: "Optional status: ACTIVE, DRAFT, DEPRECATED.",
    inputSchema: z.object({ status: z.enum(["ACTIVE", "DRAFT", "DEPRECATED"]).optional() })
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.status) params.set("status", args.status);
    const q = params.toString();
    const data = await drdFetch<{ capabilities: unknown[] }>(`/api/ontology/capabilities${q ? `?${q}` : ""}`);
    return textContent(JSON.stringify(data, null, 2));
  }
);

server.registerTool(
  "tymio_get_capability",
  {
    title: "Get one capability by id or slug",
    description: "Provide id or slug.",
    inputSchema: z.object({ id: z.string().optional(), slug: z.string().optional() })
  },
  async (args) => {
    if (args.id) {
      const data = await drdFetch<{ capability: unknown }>(`/api/ontology/capabilities/${args.id}`);
      return textContent(JSON.stringify(data, null, 2));
    }
    if (args.slug) {
      const data = await drdFetch<{ capability: unknown }>(`/api/ontology/capabilities/by-slug/${encodeURIComponent(args.slug)}`);
      return textContent(JSON.stringify(data, null, 2));
    }
    throw new Error("Provide id or slug");
  }
);

// --- Run
async function main() {
  if (!hasApiKey()) {
    process.stderr.write(
      "Warning: DRD_API_KEY is not set. Authenticated API calls will fail. Set DRD_API_KEY and API_KEY on the server.\n"
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
