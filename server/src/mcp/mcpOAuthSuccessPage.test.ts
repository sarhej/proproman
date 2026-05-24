import { describe, expect, it } from "vitest";
import { buildMcpOAuthSuccessPage } from "./mcpOAuthSuccessPage.js";

describe("buildMcpOAuthSuccessPage", () => {
  it("includes success copy and client label", () => {
    const html = buildMcpOAuthSuccessPage({
      redirectUri: "http://127.0.0.1:3847/callback?code=abc&state=xyz",
      clientLabel: "Cursor"
    });

    expect(html).toContain("Signed in to Tymio");
    expect(html).toContain("Authorization succeeded");
    expect(html).toContain("return to Cursor");
    expect(html).toContain("close this tab");
  });

  it("auto-redirects to the MCP client callback URL", () => {
    const redirectUri = "http://127.0.0.1:3847/callback?code=abc&state=xyz";
    const html = buildMcpOAuthSuccessPage({ redirectUri });

    expect(html).toContain(`var target = ${JSON.stringify(redirectUri)};`);
    expect(html).toContain("window.location.replace(target);");
    expect(html).toContain(`href="${redirectUri.replace(/&/g, "&amp;")}"`);
  });

  it("escapes HTML in redirect URI for href attribute and script context", () => {
    const redirectUri = 'http://127.0.0.1/callback?x="><script>alert(1)</script>';
    const html = buildMcpOAuthSuccessPage({ redirectUri });

    expect(html).not.toMatch(/href="[^"]*<script>alert\(1\)<\/script>/);
    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("\\u003cscript>");
  });
});
