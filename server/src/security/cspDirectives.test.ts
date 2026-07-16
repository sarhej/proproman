import { describe, it, expect } from "vitest";
import { CSP_IMG_SRC } from "./cspDirectives";

describe("CSP img-src (attachment previews)", () => {
  it("allows blob: so capture/annotate object-URL <img> previews are not blocked", () => {
    // Proven against production before fix:
    // content-security-policy img-src was: 'self' data: google… (no blob:)
    // → browser blocked <img src="blob:…"> → onError → "Preview unavailable"
    expect(CSP_IMG_SRC).toContain("blob:");
    expect(CSP_IMG_SRC).toContain("data:");
    expect(CSP_IMG_SRC).toContain("'self'");
  });
});
