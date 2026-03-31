import { describe, it, expect } from "vitest";
import { connectionStringForSchema } from "./tenantSchemaManager.js";

/**
 * Tests for the pure (non-DB) functions in tenantSchemaManager.
 * DB-dependent functions (createTenantSchema, dropTenantSchema, etc.)
 * are tested in integration tests.
 */

describe("connectionStringForSchema", () => {
  it("appends schema parameter to database URL", () => {
    const result = connectionStringForSchema(
      "postgresql://user:pass@host:5432/db",
      "tenant_acme"
    );
    expect(result).toContain("schema=tenant_acme");
    expect(result).toContain("postgresql://");
  });

  it("replaces existing schema parameter", () => {
    const result = connectionStringForSchema(
      "postgresql://user:pass@host:5432/db?schema=public",
      "tenant_foo"
    );
    expect(result).toContain("schema=tenant_foo");
    expect(result).not.toContain("schema=public");
  });

  it("preserves other query parameters", () => {
    const result = connectionStringForSchema(
      "postgresql://user:pass@host:5432/db?sslmode=require",
      "tenant_bar"
    );
    expect(result).toContain("sslmode=require");
    expect(result).toContain("schema=tenant_bar");
  });

  it("rejects reserved schema name: public", () => {
    expect(() =>
      connectionStringForSchema("postgresql://localhost/db", "public")
    ).toThrow("reserved");
  });

  it("rejects reserved schema name: information_schema", () => {
    expect(() =>
      connectionStringForSchema("postgresql://localhost/db", "information_schema")
    ).toThrow("reserved");
  });

  it("rejects pg_ prefixed schemas", () => {
    expect(() =>
      connectionStringForSchema("postgresql://localhost/db", "pg_toast")
    ).toThrow("cannot start with pg_");
  });

  it("rejects schemas not matching tenant_ pattern", () => {
    expect(() =>
      connectionStringForSchema("postgresql://localhost/db", "my_schema")
    ).toThrow("must match pattern");
  });

  it("rejects uppercase in schema name", () => {
    expect(() =>
      connectionStringForSchema("postgresql://localhost/db", "tenant_Acme")
    ).toThrow("must match pattern");
  });

  it("rejects empty schema name", () => {
    expect(() =>
      connectionStringForSchema("postgresql://localhost/db", "")
    ).toThrow();
  });

  it("accepts valid tenant schema names", () => {
    expect(() =>
      connectionStringForSchema("postgresql://localhost/db", "tenant_acme")
    ).not.toThrow();
    expect(() =>
      connectionStringForSchema("postgresql://localhost/db", "tenant_my_company_123")
    ).not.toThrow();
  });
});

describe("validateSchemaName edge cases", () => {
  it("rejects schema with special characters", () => {
    expect(() =>
      connectionStringForSchema("postgresql://localhost/db", "tenant_acme!")
    ).toThrow("must match pattern");
  });

  it("rejects schema with spaces", () => {
    expect(() =>
      connectionStringForSchema("postgresql://localhost/db", "tenant_acme corp")
    ).toThrow("must match pattern");
  });

  it("rejects schema with hyphens (only underscores allowed)", () => {
    expect(() =>
      connectionStringForSchema("postgresql://localhost/db", "tenant_acme-corp")
    ).toThrow("must match pattern");
  });

  it("accepts schema with underscores between words", () => {
    const result = connectionStringForSchema(
      "postgresql://localhost/db",
      "tenant_acme_corp"
    );
    expect(result).toContain("schema=tenant_acme_corp");
  });
});
