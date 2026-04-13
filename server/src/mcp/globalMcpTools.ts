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
        "Returns ACTIVE workspace memberships and each pinned Streamable HTTP URL (`.../t/<slug>/mcp`). Use these slugs/URLs to build per-project MCP config (e.g. `.cursor/mcp.json`, `.mcp.json`). Root `/mcp` does not run backlog tools — call `tymio_mcp_routing_guide` for copy-paste templates.",
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
        "Explains discovery vs workspace MCP and gives copy-paste JSON for per-project config (Cursor `.cursor/mcp.json`, Claude Code `.mcp.json`). Agents: call `tymio_list_my_workspaces` first, substitute a real slug, then create the file or give the user these steps.",
      inputSchema: emptyInputSchema
    },
    async (_args, ctx) => {
      getUserIdFromCtx(ctx);
      const base = getMcpBaseUrl().replace(/\/$/, "");
      const workspaceUrlExample = `${base}/t/YOUR_WORKSPACE_SLUG/mcp`;
      const md = [
        "# Tymio MCP routing",
        "",
        `This endpoint (\`POST ${base}/mcp\`) is **discovery-only**: OAuth + **two** tools. It does **not** select a workspace. **Backlog tools** (\`drd_*\`, workspace \`tymio_*\`) exist only on **\`${base}/t/<slug>/mcp\`**.`,
        "",
        "## Agent workflow (do this for the user)",
        "",
        "1. Call **tymio_list_my_workspaces** and pick the **slug** for the org that owns this repo or task.",
        "2. **If you can edit the repo:** create or update **per-project** MCP config using the JSON below (replace `YOUR_WORKSPACE_SLUG`). Prefer a **second** MCP server entry named e.g. `tymio-workspace` so the user can keep root `…/mcp` as optional discovery.",
        "3. **If you cannot edit files:** paste the JSON and path into chat and tell the user to save the file, then **restart Cursor** (or reload MCP) and complete OAuth if prompted.",
        "4. After reconnecting to the **workspace** URL, verify with **drd_health** or **tymio_get_agent_brief**.",
        "",
        "## Pinned workspace URL",
        "",
        `\`${workspaceUrlExample}\``,
        "",
        "(Replace `YOUR_WORKSPACE_SLUG` with a real slug from **tymio_list_my_workspaces**.)",
        "",
        "## Cursor — project file `.cursor/mcp.json`",
        "",
        "Create the `.cursor` directory at the **repository root** if needed. Use a **workspace** URL — not root `/mcp` — for backlog automation:",
        "",
        "```json",
        "{",
        '  "mcpServers": {',
        '    "tymio-workspace": {',
        `      "url": "${workspaceUrlExample}"`,
        "    }",
        "  }",
        "}",
        "```",
        "",
        "- Cursor expands placeholders like `${workspaceFolder}` in this file if you need paths in **stdio** configs.",
        `- You may add a separate server \`tymio-discovery\` with \`"url": "${base}/mcp"\` (JSON field) for OAuth + listing workspaces only.`,
        "- After saving: **quit and reopen Cursor** or reload MCP so the new URL is used; **re-authenticate** if the client asks.",
        "",
        "## Claude Code — project file `.mcp.json`",
        "",
        "At the **repository root** (same level as `.git` / `package.json`), team-shared MCP servers:",
        "",
        "```json",
        "{",
        '  "mcpServers": {',
        '    "tymio-workspace": {',
        `      "url": "${workspaceUrlExample}"`,
        "    }",
        "  }",
        "}",
        "```",
        "",
        "User-global servers may live in `~/.claude.json`; project `.mcp.json` **merges** per Claude Code docs. Replace the slug, save, restart the CLI session if needed.",
        "",
        "## Remote IDE: single Server URL",
        "",
        "If the client only has one URL field, set it to **`…/t/<slug>/mcp`** for day-to-day hub work. Use root **`…/mcp`** only when you intentionally want discovery-only tools.",
        "",
        "## stdio `@tymio/mcp-server`",
        "",
        `Set \`TYMIO_MCP_URL\` (or \`tymio-mcp login <url>\`) to \`${base}/t/<slug>/mcp\` for the full tool list — not only \`${base}/mcp\`.`,
        "",
        "## OAuth",
        "",
        "Google sign-in is the same for `/mcp` and `/t/.../mcp`. After you change the configured URL, the client may ask you to sign in again."
      ].join("\n");
      return textContent(md);
    }
  );
}
