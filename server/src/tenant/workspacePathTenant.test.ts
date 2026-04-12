import { describe, it, expect } from "vitest";
import { isCanonicalWorkspacePlanePath } from "./workspacePathTenant.js";

describe("isCanonicalWorkspacePlanePath", () => {
  it("matches /t/:slug/api/... and /t/:slug/api", () => {
    expect(isCanonicalWorkspacePlanePath("/t/acme/api/meta")).toBe(true);
    expect(isCanonicalWorkspacePlanePath("/t/acme/api")).toBe(true);
    expect(isCanonicalWorkspacePlanePath("/t/acme/api/")).toBe(true);
  });

  it("matches /t/:slug/mcp", () => {
    expect(isCanonicalWorkspacePlanePath("/t/acme/mcp")).toBe(true);
    expect(isCanonicalWorkspacePlanePath("/t/acme/mcp/")).toBe(true);
  });

  it("does not match legacy /api or non-hub /t segments", () => {
    expect(isCanonicalWorkspacePlanePath("/api/meta")).toBe(false);
    expect(isCanonicalWorkspacePlanePath("/t/acme/hub")).toBe(false);
    expect(isCanonicalWorkspacePlanePath("/t")).toBe(false);
    expect(isCanonicalWorkspacePlanePath("/t//api/x")).toBe(false);
  });
});
