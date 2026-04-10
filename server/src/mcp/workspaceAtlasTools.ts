import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isPlatformSuperAdmin } from "../lib/workspaceRbac.js";
import { workspaceMembershipCanWriteContent } from "../lib/workspaceRbac.js";
import { appendMcpFeedbackToToolResult } from "../lib/mcpFeedbackNotice.js";
import { getTenantContext, requireTenantContext } from "../tenant/tenantContext.js";
import { compileWorkspaceAtlasForTenant } from "../workspaceAtlas/compiler.js";
import { createWorkspaceAtlasLlmFromEnv } from "../workspaceAtlas/llm.js";
import { workspaceAtlasMetrics } from "../workspaceAtlas/metrics.js";
import { readObjectShard, readWorkspaceAtlas } from "../workspaceAtlas/store.js";
import { searchWorkspaceAtlas } from "../workspaceAtlas/search.js";
import { env } from "../env.js";

function textContent(text: string) {
  return { content: [{ type: "text" as const, text: appendMcpFeedbackToToolResult(text) }] };
}

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

function getUserFromCtx(ctx: unknown): { userId: string; role: string } {
  requireTenantContext();
  const extra = (ctx as { authInfo?: { extra?: Record<string, unknown> } })?.authInfo?.extra;
  if (!extra?.userId) throw new Error("Not authenticated");
  return { userId: extra.userId as string, role: extra.role as string };
}

function requireMcpWorkspaceContentWrite(membershipRole: string, globalRole: string): void {
  if (isPlatformSuperAdmin(globalRole)) return;
  if (!workspaceMembershipCanWriteContent(membershipRole)) {
    throw new Error("Forbidden: workspace VIEWER cannot modify data.");
  }
}

/**
 * Materialized workspace atlas + object shards (JSON). See server/src/workspaceAtlas/.
 * Keep tool descriptions short; details live in repo docs.
 */
export function registerWorkspaceAtlasTools(server: McpServer): void {
  server.registerTool(
    "tymio_get_workspace_atlas",
    {
      title: "Get compiled workspace atlas (JSON)",
      description:
        "Returns workspace-atlas.json: compact indices for domains, products, initiatives, features, requirements plus ontology pointers. Use before deep dives to save tokens.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const { tenantId } = getTenantContext()!;
      const atlas = await readWorkspaceAtlas(tenantId);
      if (!atlas) {
        return textContent(
          JSON.stringify(
            {
              error: "not_built",
              message:
                "Workspace atlas has not been compiled yet. Ask an editor to run tymio_rebuild_workspace_atlas once, or wait for the next hub change debounced rebuild.",
              metrics: workspaceAtlasMetrics
            },
            null,
            2
          )
        );
      }
      return textContent(JSON.stringify({ atlas, metrics: workspaceAtlasMetrics }, null, 2));
    }
  );

  server.registerTool(
    "tymio_get_workspace_object",
    {
      title: "Get one materialized object shard (JSON)",
      description:
        "Fetch a single DOMAIN, PRODUCT, INITIATIVE, FEATURE, or REQUIREMENT shard with facts + graph links. IDs come from drd_* lists or the workspace atlas.",
      inputSchema: mcpWithWorkspace({
        objectType: z.enum(["DOMAIN", "PRODUCT", "INITIATIVE", "FEATURE", "REQUIREMENT"]),
        id: z.string().min(1)
      })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const { tenantId } = getTenantContext()!;
      const shard = await readObjectShard(tenantId, args.objectType, args.id);
      if (!shard) {
        return textContent(
          JSON.stringify(
            {
              error: "not_found",
              objectType: args.objectType,
              id: args.id,
              hint: "Object may not exist, or atlas not compiled yet (tymio_rebuild_workspace_atlas)."
            },
            null,
            2
          )
        );
      }
      return textContent(JSON.stringify({ shard }, null, 2));
    }
  );

  server.registerTool(
    "tymio_search_workspace_objects",
    {
      title: "Search workspace atlas indices (keyword)",
      description:
        "Case-insensitive substring search over atlas title indices (not full RAG). Use short queries; combine with tymio_get_workspace_object for details.",
      inputSchema: mcpWithWorkspace({
        query: z.string().min(1).max(500),
        limit: z.number().int().min(1).max(50).optional().default(20)
      })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const { tenantId } = getTenantContext()!;
      const atlas = await readWorkspaceAtlas(tenantId);
      if (!atlas) {
        return textContent(
          JSON.stringify(
            {
              error: "not_built",
              message: "Atlas not compiled yet.",
              metrics: workspaceAtlasMetrics
            },
            null,
            2
          )
        );
      }
      const hits = searchWorkspaceAtlas(atlas, args.query, args.limit ?? 20);
      return textContent(JSON.stringify({ hits, query: args.query }, null, 2));
    }
  );

  server.registerTool(
    "tymio_explain_workspace_object",
    {
      title: "Explain object shard in natural language (optional LLM)",
      description:
        "Grounded explanation: passes shard JSON to the configured small model when WORKSPACE_ATLAS_LLM_ENABLED + OPENAI key are set. If LLM is disabled, returns structured JSON only.",
      inputSchema: mcpWithWorkspace({
        objectType: z.enum(["DOMAIN", "PRODUCT", "INITIATIVE", "FEATURE", "REQUIREMENT"]),
        id: z.string().min(1)
      })
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      getUserFromCtx(ctx);
      const { tenantId } = getTenantContext()!;
      const shard = await readObjectShard(tenantId, args.objectType, args.id);
      if (!shard) {
        return textContent(
          JSON.stringify({ error: "not_found", objectType: args.objectType, id: args.id }, null, 2)
        );
      }

      if (!env.WORKSPACE_ATLAS_LLM_ENABLED || !env.WORKSPACE_ATLAS_OPENAI_API_KEY) {
        return textContent(
          JSON.stringify(
            {
              objectType: shard.objectType,
              id: shard.id,
              explanation: null,
              llmDisabled: true,
              shard
            },
            null,
            2
          )
        );
      }

      const llm = createWorkspaceAtlasLlmFromEnv();
      const explanation = await llm.completeText(
        "You explain Tymio backlog objects to developers. Use only the JSON facts provided. Be concise. Mention parent links (domain, product, initiative, feature) when present.",
        `Explain this ${shard.objectType} object for a teammate:\n${JSON.stringify(shard, null, 2)}`
      );
      return textContent(
        JSON.stringify(
          {
            objectType: shard.objectType,
            id: shard.id,
            explanation,
            shard,
            metrics: workspaceAtlasMetrics
          },
          null,
          2
        )
      );
    }
  );

  server.registerTool(
    "tymio_rebuild_workspace_atlas",
    {
      title: "Rebuild workspace atlas + shards from hub data",
      description:
        "Re-materialize workspace-atlas.json and per-object JSON shards from the database. Requires workspace content write (EDITOR+). Deterministic; no RAG.",
      inputSchema: mcpWithWorkspace({})
    },
    async (args, ctx) => {
      assertMcpWorkspaceSlug(args.workspaceSlug);
      const { userId, role } = getUserFromCtx(ctx);
      const { membershipRole, tenantId } = getTenantContext()!;
      void userId;
      requireMcpWorkspaceContentWrite(membershipRole, role);
      await compileWorkspaceAtlasForTenant(tenantId);
      const atlas = await readWorkspaceAtlas(tenantId);
      return textContent(
        JSON.stringify(
          {
            ok: true,
            atlasPresent: !!atlas,
            materializedAt: atlas?.materializedAt ?? null,
            metrics: workspaceAtlasMetrics
          },
          null,
          2
        )
      );
    }
  );
}
