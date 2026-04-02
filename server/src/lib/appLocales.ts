import { MembershipRole } from "@prisma/client";

/** UI locales shipped in the SPA (keep in sync with client `APP_LOCALE_CODES`). */
export const APP_LOCALE_CODES = ["en", "cs", "sk", "uk", "pl"] as const;
export type AppLocaleCode = (typeof APP_LOCALE_CODES)[number];

const LOCALE_DISPLAY_EN: Record<AppLocaleCode, string> = {
  en: "English",
  cs: "Czech",
  sk: "Slovak",
  uk: "Ukrainian",
  pl: "Polish",
};

/** Open Graph-style locale tags (primary + alternates) for SEO; keep in sync with client `index.html`. */
const LOCALE_OG: Record<AppLocaleCode, string> = {
  en: "en_US",
  cs: "cs_CZ",
  sk: "sk_SK",
  uk: "uk_UA",
  pl: "pl_PL",
};

export type AppUiLocalePublicRow = { code: AppLocaleCode; name: string; ogLocale: string };

/** Public metadata for SEO, `GET /api/mcp/agent-context`, and crawler-oriented docs. */
export function getAppUiLocalesForPublicMeta(): readonly AppUiLocalePublicRow[] {
  return APP_LOCALE_CODES.map((code) => ({
    code,
    name: LOCALE_DISPLAY_EN[code],
    ogLocale: LOCALE_OG[code],
  }));
}

const SET = new Set<string>(APP_LOCALE_CODES);

function isAppLocale(code: string): code is AppLocaleCode {
  return SET.has(code);
}

/**
 * Reads `settings.enabledLocales` on Tenant.settings JSON.
 * Missing / invalid / empty → all app locales (workspace has not restricted yet).
 * Always returns a non-empty subset of APP_LOCALE_CODES.
 */
export function parseTenantEnabledLocales(settings: unknown): AppLocaleCode[] {
  if (settings === null || settings === undefined) return [...APP_LOCALE_CODES];
  if (typeof settings !== "object" || Array.isArray(settings)) return [...APP_LOCALE_CODES];
  const raw = (settings as { enabledLocales?: unknown }).enabledLocales;
  if (!Array.isArray(raw) || raw.length === 0) return [...APP_LOCALE_CODES];
  const picked: AppLocaleCode[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const code = item.trim().toLowerCase();
    if (!isAppLocale(code) || seen.has(code)) continue;
    seen.add(code);
    picked.push(code);
  }
  return picked.length > 0 ? picked : [...APP_LOCALE_CODES];
}

/** Validates and normalizes a client payload; at least one locale required. */
export function normalizeEnabledLocalesPayload(input: unknown): AppLocaleCode[] | null {
  if (!Array.isArray(input)) return null;
  const picked: AppLocaleCode[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") return null;
    const code = item.trim().toLowerCase();
    if (!isAppLocale(code)) return null;
    if (seen.has(code)) continue;
    seen.add(code);
    picked.push(code);
  }
  return picked.length > 0 ? picked : null;
}

export function canManageTenantLocaleSettings(
  platformRole: string,
  membershipRole: MembershipRole | string | undefined
): boolean {
  if (platformRole === "SUPER_ADMIN") return true;
  return membershipRole === MembershipRole.OWNER || membershipRole === MembershipRole.ADMIN;
}
