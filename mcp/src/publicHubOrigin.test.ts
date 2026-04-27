import { afterEach, describe, expect, it } from "vitest";
import { resolvePublicHubOrigin } from "./publicHubOrigin.js";

describe("resolvePublicHubOrigin", () => {
  const snap = {
    TYMIO_API_BASE_URL: process.env.TYMIO_API_BASE_URL,
    DRD_API_BASE_URL: process.env.DRD_API_BASE_URL,
    TYMIO_MCP_URL: process.env.TYMIO_MCP_URL
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("prefers TYMIO_API_BASE_URL", () => {
    delete process.env.DRD_API_BASE_URL;
    delete process.env.TYMIO_MCP_URL;
    process.env.TYMIO_API_BASE_URL = "https://hub.example.com/";
    expect(resolvePublicHubOrigin()).toBe("https://hub.example.com");
  });

  it("falls back to DRD_API_BASE_URL", () => {
    delete process.env.TYMIO_API_BASE_URL;
    process.env.DRD_API_BASE_URL = "https://legacy.example.com";
    expect(resolvePublicHubOrigin()).toBe("https://legacy.example.com");
  });

  it("derives origin from TYMIO_MCP_URL workspace path", () => {
    delete process.env.TYMIO_API_BASE_URL;
    delete process.env.DRD_API_BASE_URL;
    process.env.TYMIO_MCP_URL = "https://tymio.app/t/acme/mcp";
    expect(resolvePublicHubOrigin()).toBe("https://tymio.app");
  });

  it("defaults to tymio.app", () => {
    delete process.env.TYMIO_API_BASE_URL;
    delete process.env.DRD_API_BASE_URL;
    delete process.env.TYMIO_MCP_URL;
    expect(resolvePublicHubOrigin()).toBe("https://tymio.app");
  });
});
