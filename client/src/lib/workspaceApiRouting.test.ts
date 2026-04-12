import { describe, it, expect, beforeEach } from "vitest";
import {
  applyWorkspacePrefixToApiPath,
  isControlPlaneApiPath,
  setWorkspaceApiCanonicalSlug,
} from "./workspaceApiRouting";

describe("workspaceApiRouting", () => {
  beforeEach(() => {
    setWorkspaceApiCanonicalSlug(null);
  });

  it("prefixes hub paths when slug is set", () => {
    setWorkspaceApiCanonicalSlug("soma");
    expect(applyWorkspacePrefixToApiPath("/api/meta")).toBe("/t/soma/api/meta");
    expect(applyWorkspacePrefixToApiPath("/api/initiatives")).toBe("/t/soma/api/initiatives");
  });

  it("does not prefix control-plane paths", () => {
    setWorkspaceApiCanonicalSlug("soma");
    expect(applyWorkspacePrefixToApiPath("/api/auth/me")).toBe("/api/auth/me");
    expect(applyWorkspacePrefixToApiPath("/api/me/tenants")).toBe("/api/me/tenants");
    expect(applyWorkspacePrefixToApiPath("/api/tenant-requests")).toBe("/api/tenant-requests");
    expect(isControlPlaneApiPath("/api/me/tenants")).toBe(true);
    expect(isControlPlaneApiPath("/api/me")).toBe(true);
    // Regression: `/api/meta` must not match the `/api/me` prefix rule.
    expect(isControlPlaneApiPath("/api/meta")).toBe(false);
    expect(applyWorkspacePrefixToApiPath("/api/meta")).toBe("/t/soma/api/meta");
  });

  it("encodes slug in path", () => {
    setWorkspaceApiCanonicalSlug("a b");
    expect(applyWorkspacePrefixToApiPath("/api/meta")).toBe("/t/a%20b/api/meta");
  });
});
