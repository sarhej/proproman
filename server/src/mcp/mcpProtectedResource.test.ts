import { describe, expect, it } from "vitest";
import {
  buildTenantMcpProtectedResourceMetadata,
  globalMcpProtectedResourceMetadataUrl,
  tenantMcpProtectedResourceMetadataUrl,
  tenantMcpResourceHref
} from "./mcpProtectedResource.js";

describe("mcpProtectedResource", () => {
  const base = "https://tymio.app";
  const issuer = "https://tymio.app";

  it("global PRM URL matches SDK layout for root /mcp", () => {
    expect(globalMcpProtectedResourceMetadataUrl(base)).toBe(
      "https://tymio.app/.well-known/oauth-protected-resource/mcp"
    );
  });

  it("tenant PRM URL and resource href align with Server URL …/t/soma/mcp", () => {
    expect(tenantMcpProtectedResourceMetadataUrl(base, "soma")).toBe(
      "https://tymio.app/.well-known/oauth-protected-resource/t/soma/mcp"
    );
    expect(tenantMcpResourceHref(base, "soma")).toBe("https://tymio.app/t/soma/mcp");
  });

  it("tenant protected resource JSON matches Cursor strict resource check", () => {
    const md = buildTenantMcpProtectedResourceMetadata(base, issuer, "soma");
    expect(md.resource).toBe("https://tymio.app/t/soma/mcp");
    expect(md.authorization_servers).toEqual([issuer]);
    expect(md.scopes_supported).toEqual(["mcp:tools"]);
    expect(md.resource_name).toBe("Tymio MCP");
  });
});
