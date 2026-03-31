import { describe, it, expect } from "vitest";
import { z } from "zod";
import { UserRole } from "@prisma/client";

/**
 * Zod schema validation tests for auth routes.
 * Mirrors the validation in routes/auth.ts dev-login endpoint.
 */

const devLoginSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  tenantId: z.string().min(1).optional(),
  tenantSlug: z.string().min(1).optional(),
});

describe("dev-login request body validation", () => {
  it("accepts empty body", () => {
    const result = devLoginSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts role only", () => {
    const result = devLoginSchema.safeParse({ role: "SUPER_ADMIN" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.role).toBe("SUPER_ADMIN");
  });

  it("accepts tenantId only", () => {
    const result = devLoginSchema.safeParse({ tenantId: "t-123" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tenantId).toBe("t-123");
  });

  it("accepts role + tenantId together", () => {
    const result = devLoginSchema.safeParse({ role: "EDITOR", tenantId: "t-abc" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("EDITOR");
      expect(result.data.tenantId).toBe("t-abc");
    }
  });

  it("accepts all valid UserRole values", () => {
    const roles: UserRole[] = ["SUPER_ADMIN", "ADMIN", "EDITOR", "MARKETING", "VIEWER", "PENDING"];
    for (const role of roles) {
      const result = devLoginSchema.safeParse({ role });
      expect(result.success, `Role ${role} should be valid`).toBe(true);
    }
  });

  it("rejects invalid role", () => {
    const result = devLoginSchema.safeParse({ role: "GOD_MODE" });
    expect(result.success).toBe(false);
  });

  it("rejects empty tenantId string", () => {
    const result = devLoginSchema.safeParse({ tenantId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects null role", () => {
    const result = devLoginSchema.safeParse({ role: null });
    expect(result.success).toBe(false);
  });

  it("rejects numeric role", () => {
    const result = devLoginSchema.safeParse({ role: 42 });
    expect(result.success).toBe(false);
  });

  it("ignores extra fields", () => {
    const result = devLoginSchema.safeParse({ role: "ADMIN", extra: "ignored" });
    expect(result.success).toBe(true);
  });

  it("role is undefined when omitted", () => {
    const result = devLoginSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBeUndefined();
      expect(result.data.tenantId).toBeUndefined();
    }
  });
});

describe("dev-login tenantId edge cases", () => {
  it("accepts UUID-like tenantId", () => {
    const result = devLoginSchema.safeParse({ tenantId: "cmn5030ay00008o30eqnc2lsz" });
    expect(result.success).toBe(true);
  });

  it("accepts long tenantId", () => {
    const result = devLoginSchema.safeParse({ tenantId: "a".repeat(200) });
    expect(result.success).toBe(true);
  });

  it("rejects tenantId as number", () => {
    const result = devLoginSchema.safeParse({ tenantId: 123 });
    expect(result.success).toBe(false);
  });

  it("rejects tenantId as null", () => {
    const result = devLoginSchema.safeParse({ tenantId: null });
    expect(result.success).toBe(false);
  });
});

describe("dev-login tenantSlug support", () => {
  it("accepts tenantSlug only", () => {
    const result = devLoginSchema.safeParse({ tenantSlug: "strt" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tenantSlug).toBe("strt");
  });

  it("accepts tenantSlug with role", () => {
    const result = devLoginSchema.safeParse({ role: "EDITOR", tenantSlug: "strt" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("EDITOR");
      expect(result.data.tenantSlug).toBe("strt");
    }
  });

  it("accepts both tenantId and tenantSlug (tenantId takes precedence in implementation)", () => {
    const result = devLoginSchema.safeParse({ tenantId: "t-1", tenantSlug: "strt" });
    expect(result.success).toBe(true);
  });

  it("rejects empty tenantSlug", () => {
    const result = devLoginSchema.safeParse({ tenantSlug: "" });
    expect(result.success).toBe(false);
  });

  it("rejects null tenantSlug", () => {
    const result = devLoginSchema.safeParse({ tenantSlug: null });
    expect(result.success).toBe(false);
  });

  it("rejects numeric tenantSlug", () => {
    const result = devLoginSchema.safeParse({ tenantSlug: 42 });
    expect(result.success).toBe(false);
  });

  it("accepts hyphenated tenantSlug", () => {
    const result = devLoginSchema.safeParse({ tenantSlug: "my-team-123" });
    expect(result.success).toBe(true);
  });

  it("tenantSlug is undefined when omitted", () => {
    const result = devLoginSchema.safeParse({ role: "ADMIN" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tenantSlug).toBeUndefined();
  });
});
