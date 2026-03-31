import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Zod schema validation tests for /api/me/tenants/* endpoints.
 * Mirrors the validation in routes/me.ts.
 */

const switchTenantSchema = z.object({
  tenantId: z.string().min(1),
});

describe("POST /me/tenants/switch validation", () => {
  it("accepts valid tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: "t-123" });
    expect(result.success).toBe(true);
  });

  it("rejects missing tenantId", () => {
    const result = switchTenantSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects null tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: null });
    expect(result.success).toBe(false);
  });

  it("rejects numeric tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects boolean tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: true });
    expect(result.success).toBe(false);
  });

  it("accepts CUID-like tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: "cmn5030ay00008o30eqnc2lsz" });
    expect(result.success).toBe(true);
  });

  it("accepts UUID tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: "550e8400-e29b-41d4-a716-446655440000" });
    expect(result.success).toBe(true);
  });

  it("ignores extra fields", () => {
    const result = switchTenantSchema.safeParse({ tenantId: "t-1", extra: "ignored" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tenantId).toBe("t-1");
    }
  });
});

describe("tenant switch edge cases", () => {
  it("accepts single-character tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: "x" });
    expect(result.success).toBe(true);
  });

  it("accepts very long tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: "a".repeat(500) });
    expect(result.success).toBe(true);
  });

  it("rejects array as tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: ["t-1"] });
    expect(result.success).toBe(false);
  });

  it("rejects object as tenantId", () => {
    const result = switchTenantSchema.safeParse({ tenantId: { id: "t-1" } });
    expect(result.success).toBe(false);
  });
});
