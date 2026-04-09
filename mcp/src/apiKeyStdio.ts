/**
 * REST/API-key stdio bridge (subset of hub tools). Set DRD_API_BASE_URL + DRD_API_KEY (or API_KEY).
 * Requires TYMIO_WORKSPACE_SLUG or DRD_WORKSPACE_SLUG (unless TYMIO_MCP_SKIP_WORKSPACE_PINNING=1 for tests).
 */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveTenantIdForWorkspaceSlug } from "./apiKeyTenantResolve.js";
import { drdFetch, drdFetchText, getBaseUrl, hasApiKey, setApiKeyBridgeTenantId } from "./api.js";
import { getMcpServerInstructions } from "./persona.js";
import { toolTextWithFeedback } from "./mcpFeedbackFooter.js";
import { writeStdioStartupHint } from "./stdioHints.js";
import {
  assertToolArgsMatchPinnedWorkspace,
  omitWorkspaceSlug,
  readPinnedWorkspaceSlugForStdio,
  WORKSPACE_SLUG_ZOD
} from "./workspaceSlug.js";

export async function runApiKeyStdio(): Promise<void> {
  writeStdioStartupHint("api-key");

  const pinnedSlug = readPinnedWorkspaceSlugForStdio();
  if (pinnedSlug) {
    try {
      const tenantId = await resolveTenantIdForWorkspaceSlug(pinnedSlug);
      setApiKeyBridgeTenantId(tenantId);
    } catch (e) {
      process.stderr.write(`[tymio-mcp] API-key bridge: cannot resolve workspace: ${e}\n`);
      process.exit(1);
    }
  }

  const server = new McpServer(
    { name: "tymio-hub", version: "1.0.0" },
    { instructions: getMcpServerInstructions() }
  );

  async function textContent(text: string) {
    return toolTextWithFeedback(getBaseUrl(), text);
  }

  function assertPin(args: unknown, tool: string): void {
    if (pinnedSlug) assertToolArgsMatchPinnedWorkspace(args, pinnedSlug, tool);
  }

  const ws = { workspaceSlug: WORKSPACE_SLUG_ZOD };

  server.registerTool(
    "drd_health",
    {
      title: "Tymio API health check",
      description: "Check if the Tymio hub API is reachable. Requires workspaceSlug (must match server pin).",
      inputSchema: z.object(ws)
    },
    async (args) => {
      assertPin(args, "drd_health");
      const data = await drdFetch<{ ok: boolean }>("/api/health");
      return textContent(JSON.stringify(data));
    }
  );

  server.registerTool(
    "drd_meta",
    {
      title: "Get Tymio meta",
      description: "Get meta data: domains, products, accounts, partners, personas, revenue streams, users.",
      inputSchema: z.object(ws)
    },
    async (args) => {
      assertPin(args, "drd_meta");
      const data = await drdFetch<Record<string, unknown>>("/api/meta");
      return textContent(JSON.stringify(data, null, 2));
    }
  );

  const listInitiativesSchema = z
    .object({
      domainId: z.string().optional(),
      ownerId: z.string().optional(),
      horizon: z.enum(["NOW", "NEXT", "LATER"]).optional(),
      priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
      isGap: z.boolean().optional()
    })
    .extend(ws);

  server.registerTool(
    "drd_list_initiatives",
    {
      title: "List initiatives",
      description: "List initiatives with optional filters: domainId, ownerId, horizon, priority, isGap.",
      inputSchema: listInitiativesSchema
    },
    async (args) => {
      assertPin(args, "drd_list_initiatives");
      const { workspaceSlug: _w, ...filters } = args;
      const params = new URLSearchParams();
      if (filters.domainId) params.set("domainId", filters.domainId);
      if (filters.ownerId) params.set("ownerId", filters.ownerId);
      if (filters.horizon) params.set("horizon", filters.horizon);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.isGap !== undefined) params.set("isGap", String(filters.isGap));
      const data = await drdFetch<{ initiatives: unknown[] }>(`/api/initiatives?${params.toString()}`);
      return textContent(JSON.stringify(data.initiatives, null, 2));
    }
  );

  server.registerTool(
    "drd_get_initiative",
    {
      title: "Get initiative by ID",
      description: "Get a single initiative by its ID.",
      inputSchema: z.object({ id: z.string().describe("Initiative ID") }).extend(ws)
    },
    async (args) => {
      assertPin(args, "drd_get_initiative");
      const { id } = omitWorkspaceSlug(args as Record<string, unknown>) as { id: string };
      const data = await drdFetch<{ initiative: unknown }>(`/api/initiatives/${id}`);
      return textContent(JSON.stringify(data.initiative, null, 2));
    }
  );

  server.registerTool(
    "drd_create_initiative",
    {
      title: "Create initiative",
      description: "Create a new initiative. Requires admin/editor role.",
      inputSchema: z
        .object({
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
        .extend(ws)
    },
    async (args) => {
      assertPin(args, "drd_create_initiative");
      const body = omitWorkspaceSlug(args as Record<string, unknown>);
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
      inputSchema: z
        .object({
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
        .extend(ws)
    },
    async (args) => {
      assertPin(args, "drd_update_initiative");
      const { id, ...body } = omitWorkspaceSlug(args as Record<string, unknown>) as {
        id: string;
        [k: string]: unknown;
      };
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
      inputSchema: z.object({ id: z.string() }).extend(ws)
    },
    async (args) => {
      assertPin(args, "drd_delete_initiative");
      const { id } = omitWorkspaceSlug(args as Record<string, unknown>) as { id: string };
      await drdFetch(`/api/initiatives/${id}`, { method: "DELETE" });
      return textContent(JSON.stringify({ ok: true }));
    }
  );

  server.registerTool(
    "drd_list_domains",
    {
      title: "List domains",
      description: "List all domains.",
      inputSchema: z.object(ws)
    },
    async (args) => {
      assertPin(args, "drd_list_domains");
      const data = await drdFetch<{ domains: unknown[] }>("/api/domains");
      return textContent(JSON.stringify(data.domains, null, 2));
    }
  );

  server.registerTool(
    "drd_create_domain",
    {
      title: "Create domain",
      description: "Create a new domain (pillar). Requires workspace OWNER or ADMIN.",
      inputSchema: z
        .object({
          name: z.string().min(1),
          color: z.string().min(1),
          sortOrder: z.number().int().optional()
        })
        .extend(ws)
    },
    async (args) => {
      assertPin(args, "drd_create_domain");
      const body = omitWorkspaceSlug(args as Record<string, unknown>) as {
        name: string;
        color: string;
        sortOrder?: number;
      };
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
      inputSchema: z.object(ws)
    },
    async (args) => {
      assertPin(args, "drd_list_products");
      const data = await drdFetch<{ products: unknown[] }>("/api/products");
      return textContent(JSON.stringify(data.products, null, 2));
    }
  );

  server.registerTool(
    "drd_list_personas",
    {
      title: "List personas",
      description: "List all personas.",
      inputSchema: z.object(ws)
    },
    async (args) => {
      assertPin(args, "drd_list_personas");
      const data = await drdFetch<{ personas: unknown[] }>("/api/personas");
      return textContent(JSON.stringify(data.personas, null, 2));
    }
  );

  server.registerTool(
    "drd_list_accounts",
    {
      title: "List accounts",
      description: "List all accounts.",
      inputSchema: z.object(ws)
    },
    async (args) => {
      assertPin(args, "drd_list_accounts");
      const data = await drdFetch<{ accounts: unknown[] }>("/api/accounts");
      return textContent(JSON.stringify(data.accounts, null, 2));
    }
  );

  server.registerTool(
    "drd_list_partners",
    {
      title: "List partners",
      description: "List all partners.",
      inputSchema: z.object(ws)
    },
    async (args) => {
      assertPin(args, "drd_list_partners");
      const data = await drdFetch<{ partners: unknown[] }>("/api/partners");
      return textContent(JSON.stringify(data.partners, null, 2));
    }
  );

  server.registerTool(
    "drd_list_kpis",
    {
      title: "List KPIs",
      description: "List all initiative KPIs with their initiative context (title, domain, owner).",
      inputSchema: z.object(ws)
    },
    async (args) => {
      assertPin(args, "drd_list_kpis");
      const data = await drdFetch<{ kpis: unknown[] }>("/api/kpis");
      return textContent(JSON.stringify(data.kpis, null, 2));
    }
  );

  server.registerTool(
    "drd_list_milestones",
    {
      title: "List milestones",
      description: "List all initiative milestones with their initiative context.",
      inputSchema: z.object(ws)
    },
    async (args) => {
      assertPin(args, "drd_list_milestones");
      const data = await drdFetch<{ milestones: unknown[] }>("/api/milestones");
      return textContent(JSON.stringify(data.milestones, null, 2));
    }
  );

  server.registerTool(
    "drd_list_demands",
    {
      title: "List demands",
      description: "List all demands (from accounts, partners, internal, compliance).",
      inputSchema: z.object(ws)
    },
    async (args) => {
      assertPin(args, "drd_list_demands");
      const data = await drdFetch<{ demands: unknown[] }>("/api/demands");
      return textContent(JSON.stringify(data.demands, null, 2));
    }
  );

  server.registerTool(
    "drd_list_revenue_streams",
    {
      title: "List revenue streams",
      description: "List all revenue streams.",
      inputSchema: z.object(ws)
    },
    async (args) => {
      assertPin(args, "drd_list_revenue_streams");
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
      inputSchema: z.object(ws)
    },
    async (args) => {
      assertPin(args, "tymio_get_coding_agent_guide");
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
      inputSchema: z
        .object({
          mode: z.enum(["compact", "full"]).default("compact"),
          format: z.enum(["md", "json"]).default("md")
        })
        .extend(ws)
    },
    async (args) => {
      assertPin(args, "tymio_get_agent_brief");
      const { mode, format } = omitWorkspaceSlug(args as Record<string, unknown>) as {
        mode: "compact" | "full";
        format: "md" | "json";
      };
      const params = new URLSearchParams({ mode, format });
      const q = params.toString();
      const raw = await drdFetchText(`/api/ontology/brief?${q}`);
      if (format === "json") {
        try {
          const parsed = JSON.parse(raw) as unknown;
          return textContent(JSON.stringify(parsed, null, 2));
        } catch {
          return textContent(raw);
        }
      }
      return textContent(raw);
    }
  );

  server.registerTool(
    "tymio_list_capabilities",
    {
      title: "List hub capabilities (ontology)",
      description: "Optional status: ACTIVE, DRAFT, DEPRECATED.",
      inputSchema: z.object({ status: z.enum(["ACTIVE", "DRAFT", "DEPRECATED"]).optional() }).extend(ws)
    },
    async (args) => {
      assertPin(args, "tymio_list_capabilities");
      const { status } = omitWorkspaceSlug(args as Record<string, unknown>) as { status?: string };
      const params = new URLSearchParams();
      if (status) params.set("status", status);
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
      inputSchema: z
        .object({ id: z.string().optional(), slug: z.string().optional() })
        .extend(ws)
    },
    async (args) => {
      assertPin(args, "tymio_get_capability");
      const { id, slug } = omitWorkspaceSlug(args as Record<string, unknown>) as {
        id?: string;
        slug?: string;
      };
      if (id) {
        const data = await drdFetch<{ capability: unknown }>(`/api/ontology/capabilities/${id}`);
        return textContent(JSON.stringify(data, null, 2));
      }
      if (slug) {
        const data = await drdFetch<{ capability: unknown }>(
          `/api/ontology/capabilities/by-slug/${encodeURIComponent(slug)}`
        );
        return textContent(JSON.stringify(data, null, 2));
      }
      throw new Error("Provide id or slug");
    }
  );

  if (!hasApiKey()) {
    process.stderr.write(
      "Warning: DRD_API_KEY is not set. Authenticated API calls will fail. Set DRD_API_KEY and API_KEY on the server.\n"
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
