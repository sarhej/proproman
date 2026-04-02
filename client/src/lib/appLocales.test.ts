import { describe, it, expect } from "vitest";
import { APP_LOCALE_CODES, canManageWorkspaceLanguages, normalizeUiLanguageCode } from "./appLocales";

describe("appLocales (client)", () => {
  it("normalizeUiLanguageCode maps BCP47 prefix and rejects unknown", () => {
    expect(normalizeUiLanguageCode("pl")).toBe("pl");
    expect(normalizeUiLanguageCode("en-US")).toBe("en");
    expect(normalizeUiLanguageCode(undefined)).toBe("en");
    expect(normalizeUiLanguageCode("xx")).toBe("en");
  });

  it("APP_LOCALE_CODES includes pl", () => {
    expect(APP_LOCALE_CODES).toContain("pl");
  });

  it("canManageWorkspaceLanguages", () => {
    expect(canManageWorkspaceLanguages("SUPER_ADMIN", { membershipRole: "VIEWER" })).toBe(true);
    expect(canManageWorkspaceLanguages("EDITOR", { membershipRole: "OWNER" })).toBe(true);
    expect(canManageWorkspaceLanguages("EDITOR", { membershipRole: "ADMIN" })).toBe(true);
    expect(canManageWorkspaceLanguages("EDITOR", { membershipRole: "MEMBER" })).toBe(false);
    expect(canManageWorkspaceLanguages("EDITOR", null)).toBe(false);
  });
});
