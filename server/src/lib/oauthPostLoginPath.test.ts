import { describe, expect, it } from "vitest";
import { normalizeAllowlistedPostLoginPath } from "./oauthPostLoginPath.js";

describe("normalizeAllowlistedPostLoginPath", () => {
  it("allows /register-workspace", () => {
    expect(normalizeAllowlistedPostLoginPath("/register-workspace")).toBe("/register-workspace");
  });
  it("allows /", () => {
    expect(normalizeAllowlistedPostLoginPath("/")).toBe("/");
  });
  it("rejects external URLs", () => {
    expect(normalizeAllowlistedPostLoginPath("//evil.com")).toBeUndefined();
    expect(normalizeAllowlistedPostLoginPath("https://evil.com")).toBeUndefined();
  });
  it("rejects unknown paths", () => {
    expect(normalizeAllowlistedPostLoginPath("/admin")).toBeUndefined();
  });
});
