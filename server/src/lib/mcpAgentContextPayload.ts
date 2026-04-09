import { refreshMcpFeedbackNoticeCache } from "./mcpFeedbackNotice.js";
import { APP_LOCALE_CODES, getAppUiLocalesForPublicMeta } from "./appLocales.js";
import { readTymioMcpCliAgentGuidanceMarkdown } from "./readTymioMcpCliAgentGuidance.js";

/** JSON body for `GET /api/mcp/agent-context` (public). */
export async function buildMcpAgentContextJson(): Promise<{
  feedbackReporting: string;
  supportedUiLocales: {
    codes: readonly string[];
    locales: readonly { code: string; name: string; ogLocale: string }[];
    workspaceNote: string;
  };
  scopeReference: {
    pattern: string;
    purpose: string;
    workspaceUrls: string;
    dataSources: string;
  };
  /** Full Markdown: same text as `tymio-mcp instructions` / MCP server `instructions` when using @tymio/mcp-server. Empty if file not on disk (e.g. mis-deployed). */
  tymioMcpCliAgentGuidanceMarkdown: string;
  tymioMcpCliPackage: string;
  tymioMcpCliBinary: string;
  tymioMcpCliInstructionsCommand: string;
  /** Explicit flag so autonomous agents do not hallucinate a Settings UI path for MCP keys. */
  tymioMcpNoUserSettingsApiKey: true;
}> {
  const feedbackReporting = await refreshMcpFeedbackNoticeCache();
  const tymioMcpCliAgentGuidanceMarkdown = readTymioMcpCliAgentGuidanceMarkdown();
  return {
    feedbackReporting,
    supportedUiLocales: {
      codes: APP_LOCALE_CODES,
      locales: getAppUiLocalesForPublicMeta(),
      workspaceNote:
        "The SPA ships these interface languages (ISO 639-1 style codes: en, cs, sk, uk, pl). " +
        "Workspace owners or admins may restrict the in-app language picker via Tenant.settings.enabledLocales; " +
        "guests pick a language on public pages (stored in localStorage).",
    },
    scopeReference: {
      pattern: "<workspace-slug>/<product-slug>",
      purpose:
        "Stable human- and agent-readable label for which hub workspace and product line you mean. " +
        "Not an access-control boundary: initiatives may omit a product; agents can create cross-product or non-product work inside the same workspace.",
      workspaceUrls: "Humans often open /t/<workspace-slug> on this host.",
      dataSources:
        "Workspace slug is on the Tenant; product slug is on each Product row (see MCP drd_meta / drd_list_products and REST GET /api/meta, /api/products)."
    },
    tymioMcpCliAgentGuidanceMarkdown,
    tymioMcpCliPackage: "@tymio/mcp-server",
    tymioMcpCliBinary: "tymio-mcp",
    tymioMcpCliInstructionsCommand: "tymio-mcp instructions",
    tymioMcpNoUserSettingsApiKey: true
  };
}
