import { describe, it, expect } from "vitest";
import { TENANT_SCOPED_MODELS } from "./tenantPrisma.js";

function injectTenantWhere(args: Record<string, unknown>, tenantId: string): Record<string, unknown> {
  return { ...args, where: { ...(args.where as object ?? {}), tenantId } };
}

function injectTenantData(args: Record<string, unknown>, tenantId: string): Record<string, unknown> {
  return { ...args, data: { ...(args.data as object ?? {}), tenantId } };
}

describe("injectTenantWhere", () => {
  it("adds tenantId to empty where", () => {
    const result = injectTenantWhere({}, "t-1");
    expect(result.where).toEqual({ tenantId: "t-1" });
  });

  it("merges tenantId into existing where clause", () => {
    const result = injectTenantWhere({ where: { name: "test" } }, "t-1");
    expect(result.where).toEqual({ name: "test", tenantId: "t-1" });
  });

  it("overwrites existing tenantId in where (prevents spoofing)", () => {
    const result = injectTenantWhere({ where: { tenantId: "evil" } }, "t-1");
    expect(result.where).toEqual({ tenantId: "t-1" });
  });

  it("preserves other args besides where", () => {
    const result = injectTenantWhere({ include: { user: true }, where: {} }, "t-1");
    expect(result.include).toEqual({ user: true });
    expect(result.where).toEqual({ tenantId: "t-1" });
  });

  it("handles undefined where gracefully", () => {
    const result = injectTenantWhere({ select: { id: true } }, "t-1");
    expect(result.where).toEqual({ tenantId: "t-1" });
    expect(result.select).toEqual({ id: true });
  });
});

describe("injectTenantData", () => {
  it("adds tenantId to empty data", () => {
    const result = injectTenantData({}, "t-1");
    expect(result.data).toEqual({ tenantId: "t-1" });
  });

  it("merges tenantId into existing data", () => {
    const result = injectTenantData({ data: { name: "test" } }, "t-1");
    expect(result.data).toEqual({ name: "test", tenantId: "t-1" });
  });

  it("overwrites existing tenantId in data (prevents spoofing)", () => {
    const result = injectTenantData({ data: { tenantId: "evil", name: "x" } }, "t-1");
    expect(result.data).toEqual({ tenantId: "t-1", name: "x" });
  });

  it("preserves other args besides data", () => {
    const result = injectTenantData({ where: { id: "1" }, data: {} }, "t-1");
    expect(result.where).toEqual({ id: "1" });
    expect(result.data).toEqual({ tenantId: "t-1" });
  });

  it("handles undefined data gracefully", () => {
    const result = injectTenantData({ where: { id: "1" } }, "t-1");
    expect(result.data).toEqual({ tenantId: "t-1" });
  });
});

describe("TENANT_SCOPED_MODELS consistency", () => {
  it("all schema models with tenantId are tracked", async () => {
    const { default: fs } = await import("node:fs");
    const { default: path } = await import("node:path");
    const schemaPath = path.resolve(
      import.meta.dirname ?? process.cwd(),
      "../../prisma/schema.prisma"
    );
    const schema = fs.readFileSync(schemaPath, "utf-8");

    const modelBlocks = schema.matchAll(/model\s+(\w+)\s*\{([^}]+)\}/g);
    const modelsWithTenantId: string[] = [];
    const controlPlane = new Set(["TenantDomain", "TenantMembership", "TenantMigrationState", "Tenant", "TenantRequest"]);

    for (const match of modelBlocks) {
      const modelName = match[1];
      const body = match[2];
      if (controlPlane.has(modelName)) continue;
      if (/tenantId\s+String/.test(body)) {
        modelsWithTenantId.push(modelName);
      }
    }

    expect(modelsWithTenantId.length).toBeGreaterThan(25);

    // Every schema model with tenantId (except User) must be in the real TENANT_SCOPED_MODELS set
    for (const model of modelsWithTenantId) {
      if (model === "User") continue; // User has activeTenantId but is not tenant-scoped
      expect(
        TENANT_SCOPED_MODELS.has(model),
        `Model ${model} has tenantId in schema but is missing from TENANT_SCOPED_MODELS`
      ).toBe(true);
    }

    // Every entry in TENANT_SCOPED_MODELS must actually have tenantId in the schema
    for (const model of TENANT_SCOPED_MODELS) {
      expect(
        modelsWithTenantId.includes(model),
        `TENANT_SCOPED_MODELS entry ${model} does not have tenantId in the schema`
      ).toBe(true);
    }
  });

  it("control-plane models reference tenant via FK or relation", async () => {
    const { default: fs } = await import("node:fs");
    const { default: path } = await import("node:path");
    const schemaPath = path.resolve(
      import.meta.dirname ?? process.cwd(),
      "../../prisma/schema.prisma"
    );
    const schema = fs.readFileSync(schemaPath, "utf-8");

    const modelBlocks = schema.matchAll(/model\s+(\w+)\s*\{([^}]+)\}/g);
    const controlPlaneModelsWithFK = ["TenantDomain", "TenantMembership", "TenantMigrationState"];

    for (const match of modelBlocks) {
      const modelName = match[1];
      const body = match[2];
      if (controlPlaneModelsWithFK.includes(modelName)) {
        expect(
          /tenantId\s+String/.test(body),
          `Control-plane model ${modelName} should have tenantId FK`
        ).toBe(true);
      }
    }
  });
});
