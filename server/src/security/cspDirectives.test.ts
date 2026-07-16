import { describe, it, expect } from "vitest";
import { CSP_IMG_SRC } from "./cspDirectives";

describe("CSP img-src (attachment previews)", () => {
  it("allows blob: so capture/annotate object-URL <img> previews are not blocked", () => {
    expect(CSP_IMG_SRC).toContain("blob:");
    expect(CSP_IMG_SRC).toContain("data:");
    expect(CSP_IMG_SRC).toContain("'self'");
  });

  it("allows blob: media-src for voice playback", async () => {
    const { CSP_MEDIA_SRC } = await import("./cspDirectives.js");
    expect(CSP_MEDIA_SRC).toContain("blob:");
    expect(CSP_MEDIA_SRC).toContain("'self'");
  });
});
