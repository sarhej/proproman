import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { appendMcpFeedbackToToolResult } from "../lib/mcpFeedbackNotice.js";
import {
  buildInstallManifest,
  getSkillIndexRows,
  type InstallClient,
  type InstallScope
} from "../skills/skillCatalog.js";
import { getMcpOAuthUserId } from "./mcpOAuthContext.js";

function textContent(text: string) {
  return { content: [{ type: "text" as const, text: appendMcpFeedbackToToolResult(text) }] };
}

const emptyInputSchema = z.object({});

const installSkillInputSchema = z.object({
  id: z.string().min(1).describe("Skill id from tymio_list_skills (e.g. tymio-workspace)."),
  client: z
    .enum(["cursor", "claude", "codex", "opencode"])
    .describe("Target editor or agent runtime."),
  scope: z.enum(["project", "user"]).describe("project = repo-local; user = home directory.")
});

/**
 * Skill catalog + install helpers — same behavior on discovery (`/mcp`) and workspace (`/t/.../mcp`) MCP.
 */
export function registerSkillDistributionTools(server: McpServer): void {
  server.registerTool(
    "tymio_list_skills",
    {
      title: "List Tymio-published agent skills",
      description:
        "Returns { id, version, sha256, description }[] for skills hosted on the hub — same JSON as GET /skills/index.json. Use before tymio_install_skill.",
      inputSchema: emptyInputSchema
    },
    async (_args, ctx) => {
      getMcpOAuthUserId(ctx);
      return textContent(JSON.stringify(getSkillIndexRows(), null, 2));
    }
  );

  server.registerTool(
    "tymio_install_skill",
    {
      title: "Get skill Markdown and install path for a client",
      description:
        "Returns targetPath, body, sha256, etag for installing a published Tymio skill (same as GET /skills/:id/install-manifest). The user must consent before the CLI or agent writes to disk.",
      inputSchema: installSkillInputSchema
    },
    async (args, ctx) => {
      getMcpOAuthUserId(ctx);
      const client = args.client as InstallClient;
      const scope = args.scope as InstallScope;
      const result = buildInstallManifest(args.id, client, scope);
      if (!result.ok) {
        return textContent(JSON.stringify({ error: result.error }, null, 2));
      }
      return textContent(
        JSON.stringify(
          {
            id: args.id,
            client,
            scope,
            targetPath: result.targetPath,
            body: result.body,
            mode: result.mode,
            sha256: result.sha256,
            etag: result.etag
          },
          null,
          2
        )
      );
    }
  );
}
