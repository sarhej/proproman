import { describe, it, expect } from "vitest";
import { slugToSchemaName } from "./tenants.js";

describe("slugToSchemaName", () => {
  it("prefixes tenant_ and maps hyphens to underscores", () => {
    expect(slugToSchemaName("acme-corp")).toBe("tenant_acme_corp");
  });

  it("handles slug without hyphens", () => {
    expect(slugToSchemaName("tymio")).toBe("tenant_tymio");
  });
});
