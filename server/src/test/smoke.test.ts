import { describe, it, expect } from "vitest";

/** Minimal server test file; changes here count toward Railway `watchPatterns` (`/server/**`). */
describe("server smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
