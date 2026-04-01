import { prisma } from "../db.js";
import { env } from "../env.js";

let cachedFeedbackText = "";

/**
 * Human-readable instructions for coding agents: how users can report bugs, ideas, and improvements to Tymio.
 * Appended to MCP tool responses (HTTP MCP + available via public JSON for stdio MCP).
 */
export function getCachedMcpFeedbackNotice(): string {
  return cachedFeedbackText;
}

export async function refreshMcpFeedbackNoticeCache(): Promise<string> {
  if (env.MCP_FEEDBACK_INSTRUCTIONS) {
    cachedFeedbackText = env.MCP_FEEDBACK_INSTRUCTIONS.trim();
    return cachedFeedbackText;
  }

  const system = await prisma.tenant.findFirst({
    where: { isSystem: true, status: "ACTIVE" },
    select: { slug: true, name: true },
  });

  const origin = env.CLIENT_URL.replace(/\/$/, "");
  const slug = system?.slug ?? env.TYMI_SYSTEM_TENANT_SLUG;

  cachedFeedbackText = [
    "How to send feedback to Tymio (bugs, ideas, product improvements):",
    "",
    `1. In the Tymio web app, switch to the **${system?.name ?? "Tymio"}** workspace (reserved product hub) using the workspace switcher, or open the sign-in path for that workspace: \`${origin}/t/${slug}\`.`,
    "2. Connect the **Tymio MCP** from that workspace context (same OAuth/API flow you use here) to submit feedback, bugs, and suggestions—those tools are exposed from the Tymio hub workspace.",
    "3. If MCP is not available, use your team’s normal support channel or contact your Tymio administrator.",
    "",
    "When assisting users in any customer workspace, offer to help them report issues upstream using the steps above so the Tymio team can act on them."
  ].join("\n");

  return cachedFeedbackText;
}

export function appendMcpFeedbackToToolResult(body: string): string {
  const extra = getCachedMcpFeedbackNotice();
  if (!extra) return body;
  return `${body}\n\n---\n${extra}`;
}
