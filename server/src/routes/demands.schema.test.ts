import { describe, expect, it } from "vitest";
import {
  DemandSignalHint,
  DemandSourceType,
  DemandStatus
} from "@prisma/client";
import { demandSchema } from "./demands.js";

describe("demands API – signalHint & schema edge cases", () => {
  const minimal = {
    title: "Ticket from monitoring",
    sourceType: DemandSourceType.INTERNAL,
    status: DemandStatus.NEW
  };

  it("accepts minimal body without signalHint (optional)", () => {
    const r = demandSchema.safeParse(minimal);
    expect(r.success).toBe(true);
  });

  it("accepts every DemandSignalHint enum value", () => {
    for (const hint of Object.values(DemandSignalHint)) {
      const r = demandSchema.safeParse({ ...minimal, signalHint: hint });
      expect(r.success).toBe(true);
    }
  });

  it("rejects invalid signalHint string", () => {
    const r = demandSchema.safeParse({
      ...minimal,
      signalHint: "NOT_A_HINT"
    });
    expect(r.success).toBe(false);
  });

  it("rejects urgency below 1 or above 5", () => {
    expect(demandSchema.safeParse({ ...minimal, urgency: 0 }).success).toBe(false);
    expect(demandSchema.safeParse({ ...minimal, urgency: 6 }).success).toBe(false);
  });

  it("rejects non-integer urgency", () => {
    expect(demandSchema.safeParse({ ...minimal, urgency: 2.5 }).success).toBe(false);
  });
});
