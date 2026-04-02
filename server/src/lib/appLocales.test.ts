import { describe, it, expect } from "vitest";
import { MembershipRole } from "@prisma/client";
import {
  APP_LOCALE_CODES,
  getAppUiLocalesForPublicMeta,
  parseTenantEnabledLocales,
  normalizeEnabledLocalesPayload,
  canManageTenantLocaleSettings,
} from "./appLocales.js";

describe("appLocales", () => {
  it("getAppUiLocalesForPublicMeta covers every APP_LOCALE_CODES entry", () => {
    const rows = getAppUiLocalesForPublicMeta();
    expect(rows.length).toBe(APP_LOCALE_CODES.length);
    expect(rows.map((r) => r.code)).toEqual([...APP_LOCALE_CODES]);
    expect(rows.every((r) => r.name.length > 0 && r.ogLocale.includes("_"))).toBe(true);
  });

  it("parseTenantEnabledLocales defaults to all codes when missing", () => {
    expect(parseTenantEnabledLocales(null)).toEqual([...APP_LOCALE_CODES]);
    expect(parseTenantEnabledLocales(undefined)).toEqual([...APP_LOCALE_CODES]);
    expect(parseTenantEnabledLocales({})).toEqual([...APP_LOCALE_CODES]);
    expect(parseTenantEnabledLocales({ enabledLocales: [] })).toEqual([...APP_LOCALE_CODES]);
  });

  it("parseTenantEnabledLocales filters and dedupes", () => {
    expect(parseTenantEnabledLocales({ enabledLocales: ["pl", "en", "pl", "xx", 1] })).toEqual(["pl", "en"]);
  });

  it("normalizeEnabledLocalesPayload rejects invalid input", () => {
    expect(normalizeEnabledLocalesPayload(null)).toBeNull();
    expect(normalizeEnabledLocalesPayload([])).toBeNull();
    expect(normalizeEnabledLocalesPayload(["xx"])).toBeNull();
    expect(normalizeEnabledLocalesPayload(["en", "bad"])).toBeNull();
  });

  it("normalizeEnabledLocalesPayload accepts valid subset", () => {
    expect(normalizeEnabledLocalesPayload(["PL", "en"])).toEqual(["pl", "en"]);
  });

  it("canManageTenantLocaleSettings", () => {
    expect(canManageTenantLocaleSettings("SUPER_ADMIN", MembershipRole.VIEWER)).toBe(true);
    expect(canManageTenantLocaleSettings("ADMIN", MembershipRole.OWNER)).toBe(true);
    expect(canManageTenantLocaleSettings("ADMIN", MembershipRole.ADMIN)).toBe(true);
    expect(canManageTenantLocaleSettings("ADMIN", MembershipRole.MEMBER)).toBe(false);
    expect(canManageTenantLocaleSettings("EDITOR", MembershipRole.ADMIN)).toBe(true);
    expect(canManageTenantLocaleSettings("EDITOR", undefined)).toBe(false);
  });
});
