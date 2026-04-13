import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prismaUnscoped } from "../db.js";
import { appendMcpFeedbackToToolResult } from "../lib/mcpFeedbackNotice.js";
import { getMcpBaseUrl } from "./oauth-provider.js";

function textContent(text: string) {
  return { content: [{ type: "text" as const, text: appendMcpFeedbackToToolResult(text) }] };
}

function getUserIdFromCtx(ctx: unknown): string {
  const extra = (ctx as { authInfo?: { extra?: Record<string, unknown> } })?.authInfo?.extra;
  if (typeof extra?.userId !== "string") throw new Error("Not authenticated");
  return extra.userId;
}

const emptyInputSchema = z.object({});

/**
 * Tools for `POST /mcp` only — no tenant / runWithTenant.
 * Backlog and workspace-scoped tools live on `POST /t/:workspaceSlug/mcp`.
 */
export function registerGlobalMcpTools(server: McpServer): void {
  server.registerTool(
    "tymio_list_my_workspaces",
    {
      title: "List workspaces you can use with MCP",
      description:
        "Returns your ACTIVE workspace memberships and each workspace Streamable HTTP MCP URL (`.../t/<slug>/mcp`). Root `/mcp` does not run backlog tools.",
      inputSchema: emptyInputSchema
    },
    async (_args, ctx) => {
      const userId = getUserIdFromCtx(ctx);
      const rows = await prismaUnscoped.tenantMembership.findMany({
        where: { userId },
        include: { tenant: { select: { slug: true, name: true, status: true } } },
        orderBy: { tenant: { slug: "asc" } }
      });
      const base = getMcpBaseUrl().replace(/\/$/, "");
      const workspaces = rows
        .filter((r) => r.tenant.status === "ACTIVE")
        .map((r) => ({
          slug: r.tenant.slug,
          name: r.tenant.name,
          streamableHttpMcpUrl: `${base}/t/${encodeURIComponent(r.tenant.slug)}/mcp`
        }));
      return textContent(JSON.stringify({ workspaces }, null, 2));
    }
  );

  server.registerTool(
    "tymio_mcp_routing_guide",
    {
      title: "How to connect MCP to a workspace",
      description:
        "Explains that `POST /mcp` is workspace-agnostic discovery; `drd_*` and tenant-scoped `tymio_*` tools require `POST /t/<workspace-slug>/mcp`.",
      inputSchema: emptyInputSchema
    },
    async (_args, ctx) => {
      getUserIdFromCtx(ctx);
      const base = getMcpBaseUrl().replace(/\/$/, "");
      const md = [
        "# Tymio MCP routing",
        "",
        `This endpoint (\`POST ${base}/mcp\`) is **workspace-agnostic**: OAuth and discovery only. It does **not** attach to a single workspace.`,
        "",
        "## Backlog and hub data tools",
        "",
        "Use a **pinned** Streamable HTTP URL:",
        "",
        `\`${base}/t/<your-workspace-slug>/mcp\``,
        "",
        `Example: \`${base}/t/acme/mcp\`. Call **tymio_list_my_workspaces** (on this connection) to list your slugs and URLs.`,
        "",
        "## Cursor / IDE",
        "",
        "Set **Server URL** to the `/t/<slug>/mcp` URL for the org you want agents to modify. You can add **multiple** MCP servers for multiple workspaces.",
        "",
        "## stdio `tymio-mcp`",
        "",
        `Set \`TYMIO_MCP_URL\` (or \`tymio-mcp login <url>\`) to \`${base}/t/<slug>/mcp\` for full tool surface — not only \`${base}/mcp\`.`,
        "",
        "## OAuth",
        "",
        "Google sign-in is the same whether you authenticate against `/mcp` or `/t/.../mcp`; tokens typically work against the pinned URL after you point the client there."
      ].join("\n");
      return textContent(md);
    }
  );
}
