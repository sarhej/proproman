import { describe, it, expect } from "vitest";
import { allowWithinWindow } from "./magicLinkRateLimit.js";

describe("allowWithinWindow", () => {
  it("allows up to max requests in window", () => {
    expect(allowWithinWindow("k1", 2, 60_000)).toBe(true);
    expect(allowWithinWindow("k1", 2, 60_000)).toBe(true);
    expect(allowWithinWindow("k1", 2, 60_000)).toBe(false);
  });

  it("tracks keys independently", () => {
    expect(allowWithinWindow("a", 1, 60_000)).toBe(true);
    expect(allowWithinWindow("b", 1, 60_000)).toBe(true);
  });
});
