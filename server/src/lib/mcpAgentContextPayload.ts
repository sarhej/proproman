import { refreshMcpFeedbackNoticeCache } from "./mcpFeedbackNotice.js";
import { APP_LOCALE_CODES, getAppUiLocalesForPublicMeta } from "./appLocales.js";

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
}> {
  const feedbackReporting = await refreshMcpFeedbackNoticeCache();
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
    }
  };
}
