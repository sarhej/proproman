import { describe, expect, it } from "vitest";
import { DemandSignalHint, RiskLevel } from "@prisma/client";
import { riskPatchSchema, riskSchema } from "./risks.js";

describe("risks API – signalHint schema edge cases", () => {
  const minimal = {
    title: "OAuth scope creep",
    probability: RiskLevel.MEDIUM,
    impact: RiskLevel.HIGH
  };

  it("accepts POST body without signalHint", () => {
    expect(riskSchema.safeParse(minimal).success).toBe(true);
  });

  it("accepts POST body with each DemandSignalHint", () => {
    for (const hint of Object.values(DemandSignalHint)) {
      expect(riskSchema.safeParse({ ...minimal, signalHint: hint }).success).toBe(true);
    }
  });

  it("rejects invalid signalHint on POST", () => {
    expect(
      riskSchema.safeParse({ ...minimal, signalHint: "BAD" }).success
    ).toBe(false);
  });

  it("PATCH accepts empty object", () => {
    expect(riskPatchSchema.safeParse({}).success).toBe(true);
  });

  it("PATCH accepts only signalHint", () => {
    const r = riskPatchSchema.safeParse({ signalHint: DemandSignalHint.PARTNER_SIGNAL });
    expect(r.success).toBe(true);
  });

  it("PATCH rejects invalid signalHint", () => {
    expect(riskPatchSchema.safeParse({ signalHint: "nope" }).success).toBe(false);
  });
});
