import { afterEach, describe, expect, it } from "vitest";
import { defaultMcpUrl, defaultOAuthRedirectUrl, getTymioConfigDir } from "./configPaths.js";

const saved = {
  TYMIO_MCP_URL: process.env.TYMIO_MCP_URL,
  TYMIO_OAUTH_PORT: process.env.TYMIO_OAUTH_PORT,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME
};

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("getTymioConfigDir", () => {
  it("uses XDG_CONFIG_HOME when set", () => {
    process.env.XDG_CONFIG_HOME = "/tmp/xdg";
    expect(getTymioConfigDir()).toBe("/tmp/xdg/tymio-mcp");
  });
});

describe("defaultMcpUrl", () => {
  it("defaults to production /mcp", () => {
    delete process.env.TYMIO_MCP_URL;
    expect(defaultMcpUrl().href).toBe("https://tymio.app/mcp");
  });

  it("appends /mcp when origin has no path", () => {
    process.env.TYMIO_MCP_URL = "https://example.com";
    expect(defaultMcpUrl().href).toBe("https://example.com/mcp");
  });

  it("does not duplicate /mcp", () => {
    process.env.TYMIO_MCP_URL = "https://example.com/mcp";
    expect(defaultMcpUrl().href).toBe("https://example.com/mcp");
  });

  it("strips trailing slashes before normalizing", () => {
    process.env.TYMIO_MCP_URL = "https://example.com/api///";
    expect(defaultMcpUrl().href).toBe("https://example.com/api/mcp");
  });

  it("treats whitespace-only env as default", () => {
    process.env.TYMIO_MCP_URL = "   \t  ";
    expect(defaultMcpUrl().href).toBe("https://tymio.app/mcp");
  });

  it("preserves /mcp with trailing slash trimmed", () => {
    process.env.TYMIO_MCP_URL = "https://hub.test/mcp/";
    expect(defaultMcpUrl().href).toBe("https://hub.test/mcp");
  });
});

describe("defaultOAuthRedirectUrl", () => {
  it("defaults to port 19876", () => {
    delete process.env.TYMIO_OAUTH_PORT;
    expect(defaultOAuthRedirectUrl().href).toBe("http://127.0.0.1:19876/callback");
  });

  it("respects valid TYMIO_OAUTH_PORT", () => {
    process.env.TYMIO_OAUTH_PORT = "34567";
    expect(defaultOAuthRedirectUrl().port).toBe("34567");
  });

  it("ignores invalid port (non-integer)", () => {
    process.env.TYMIO_OAUTH_PORT = "12.5";
    expect(defaultOAuthRedirectUrl().port).toBe("19876");
  });

  it("ignores port out of range high", () => {
    process.env.TYMIO_OAUTH_PORT = "70000";
    expect(defaultOAuthRedirectUrl().port).toBe("19876");
  });

  it("ignores port zero (invalid for stable redirect)", () => {
    process.env.TYMIO_OAUTH_PORT = "0";
    expect(defaultOAuthRedirectUrl().port).toBe("19876");
  });

  it("ignores empty string", () => {
    process.env.TYMIO_OAUTH_PORT = "";
    expect(defaultOAuthRedirectUrl().port).toBe("19876");
  });

  it("ignores whitespace-only port", () => {
    process.env.TYMIO_OAUTH_PORT = "  ";
    expect(defaultOAuthRedirectUrl().port).toBe("19876");
  });

  it("ignores non-numeric port", () => {
    process.env.TYMIO_OAUTH_PORT = "abc";
    expect(defaultOAuthRedirectUrl().port).toBe("19876");
  });
});
