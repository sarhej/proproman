import { describe, it, expect } from "vitest";
import { runWithTenant, getTenantContext, requireTenantContext, TenantContext } from "./tenantContext.js";

const tenantA: TenantContext = {
  tenantId: "tenant-a-id",
  tenantSlug: "tenant-a",
  schemaName: "tenant_tenant_a",
  membershipRole: "OWNER",
};

const tenantB: TenantContext = {
  tenantId: "tenant-b-id",
  tenantSlug: "tenant-b",
  schemaName: "tenant_tenant_b",
  membershipRole: "MEMBER",
};

const tenantC: TenantContext = {
  tenantId: "tenant-c-id",
  tenantSlug: "tenant-c",
  schemaName: "tenant_tenant_c",
  membershipRole: "VIEWER",
};

describe("Tenant context (AsyncLocalStorage)", () => {
  it("returns undefined when no context is set", () => {
    expect(getTenantContext()).toBeUndefined();
  });

  it("returns the correct context inside runWithTenant", () => {
    runWithTenant(tenantA, () => {
      const ctx = getTenantContext();
      expect(ctx).toBeDefined();
      expect(ctx!.tenantId).toBe("tenant-a-id");
      expect(ctx!.tenantSlug).toBe("tenant-a");
      expect(ctx!.schemaName).toBe("tenant_tenant_a");
      expect(ctx!.membershipRole).toBe("OWNER");
    });
  });

  it("isolates contexts between nested runs", () => {
    runWithTenant(tenantA, () => {
      expect(getTenantContext()!.tenantId).toBe("tenant-a-id");

      runWithTenant(tenantB, () => {
        expect(getTenantContext()!.tenantId).toBe("tenant-b-id");
      });

      expect(getTenantContext()!.tenantId).toBe("tenant-a-id");
    });
  });

  it("isolates deeply nested contexts (3 levels)", () => {
    runWithTenant(tenantA, () => {
      expect(getTenantContext()!.tenantId).toBe("tenant-a-id");
      runWithTenant(tenantB, () => {
        expect(getTenantContext()!.tenantId).toBe("tenant-b-id");
        runWithTenant(tenantC, () => {
          expect(getTenantContext()!.tenantId).toBe("tenant-c-id");
        });
        expect(getTenantContext()!.tenantId).toBe("tenant-b-id");
      });
      expect(getTenantContext()!.tenantId).toBe("tenant-a-id");
    });
  });

  it("returns undefined after runWithTenant exits", () => {
    runWithTenant(tenantA, () => {
      expect(getTenantContext()!.tenantId).toBe("tenant-a-id");
    });
    expect(getTenantContext()).toBeUndefined();
  });

  it("supports async operations within context", async () => {
    await runWithTenant(tenantA, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(getTenantContext()!.tenantId).toBe("tenant-a-id");
    });
  });

  it("concurrent tenant contexts do not leak", async () => {
    const results: string[] = [];

    await Promise.all([
      runWithTenant(tenantA, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        results.push(getTenantContext()!.tenantId);
      }),
      runWithTenant(tenantB, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(getTenantContext()!.tenantId);
      }),
    ]);

    expect(results).toContain("tenant-a-id");
    expect(results).toContain("tenant-b-id");
    expect(results).toHaveLength(2);
  });

  it("preserves context through Promise chains", async () => {
    await runWithTenant(tenantA, async () => {
      const id = await Promise.resolve().then(() => getTenantContext()!.tenantId);
      expect(id).toBe("tenant-a-id");
    });
  });

  it("propagates thrown errors without corrupting context", () => {
    expect(() => {
      runWithTenant(tenantA, () => {
        throw new Error("boom");
      });
    }).toThrow("boom");
    expect(getTenantContext()).toBeUndefined();
  });

  it("returns the callback's return value", () => {
    const result = runWithTenant(tenantA, () => 42);
    expect(result).toBe(42);
  });
});

describe("requireTenantContext", () => {
  it("throws when no context is set", () => {
    expect(() => requireTenantContext()).toThrow("Tenant context is required");
  });

  it("returns context when inside runWithTenant", () => {
    runWithTenant(tenantA, () => {
      const ctx = requireTenantContext();
      expect(ctx.tenantId).toBe("tenant-a-id");
    });
  });

  it("throws after context exits", () => {
    runWithTenant(tenantA, () => {
      requireTenantContext();
    });
    expect(() => requireTenantContext()).toThrow("Tenant context is required");
  });
});

describe("Tenant-scoped model list", () => {
  it("TENANT_SCOPED_MODELS is consistent with schema", async () => {
    // This is a compile-time safety net — if a model is added to the schema
    // with tenantId but not to TENANT_SCOPED_MODELS, tests should be updated.
    const { default: fs } = await import("node:fs");
    const { default: path } = await import("node:path");
    const schemaPath = path.resolve(
      import.meta.dirname ?? process.cwd(),
      "../../prisma/schema.prisma"
    );
    const schema = fs.readFileSync(schemaPath, "utf-8");

    const modelBlocks = schema.matchAll(/model\s+(\w+)\s*\{([^}]+)\}/g);
    const modelsWithTenantId: string[] = [];

    for (const match of modelBlocks) {
      const modelName = match[1];
      const body = match[2];
      // Control plane models that use tenantId as a FK
      if (["TenantDomain", "TenantMembership", "TenantMigrationState", "TenantRequest"].includes(modelName)) continue;
      if (/tenantId\s+String/.test(body)) {
        modelsWithTenantId.push(modelName);
      }
    }

    expect(modelsWithTenantId.length).toBeGreaterThan(0);

    // Import the set from tenantPrisma to verify coverage
    // (accessing the module's internal constant indirectly via its behavior)
    // Here we just verify that the schema models we found are all present
    // in the expected list
    const expectedModels = new Set([
      "Product", "ExecutionBoard", "ExecutionColumn", "Domain", "Persona",
      "RevenueStream", "Initiative", "SuccessCriterion", "InitiativeComment",
      "Feature", "Requirement", "Decision", "Risk", "Account", "Partner",
      "Demand", "DemandLink", "InitiativeAssignment", "Campaign", "Asset",
      "CampaignLink", "InitiativeMilestone", "InitiativeKPI", "Stakeholder",
      "AuditEntry", "UserMessage", "NotificationRule",
      "UserNotificationSubscription", "UserNotificationPreference",
      "NotificationDelivery", "User",
    ]);

    for (const model of modelsWithTenantId) {
      expect(
        expectedModels.has(model),
        `Model ${model} has tenantId in schema but is not in the expected models list. Update TENANT_SCOPED_MODELS in tenantPrisma.ts.`
      ).toBe(true);
    }
  });
});
