/**
 * Must match server `APP_LOCALE_CODES` in server/src/lib/appLocales.ts.
 * Also keep in sync with SEO/agent copy: `client/index.html`, `client/public/llms.txt`,
 * and `GET /api/mcp/agent-context` → `supportedUiLocales` (server builds from the same list).
 */
export const APP_LOCALE_CODES = ["en", "cs", "sk", "uk", "pl"] as const;
export type AppLocaleCode = (typeof APP_LOCALE_CODES)[number];

export function normalizeUiLanguageCode(raw: string | undefined): AppLocaleCode {
  const base = (raw ?? "en").split("-")[0]?.toLowerCase() ?? "en";
  return (APP_LOCALE_CODES as readonly string[]).includes(base) ? (base as AppLocaleCode) : "en";
}

export function canManageWorkspaceLanguages(
  userRole: string,
  tenant: { membershipRole?: string } | null | undefined
): boolean {
  if (userRole === "SUPER_ADMIN") return true;
  const m = tenant?.membershipRole;
  return m === "OWNER" || m === "ADMIN";
}
