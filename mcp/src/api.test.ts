import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.resetModules();
  delete process.env.DRD_API_BASE_URL;
  delete process.env.DRD_API_KEY;
  delete process.env.API_KEY;
});

describe("drdFetch", () => {
  beforeEach(() => {
    process.env.DRD_API_BASE_URL = "http://hub.test";
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    ) as typeof fetch;
  });

  it("calls correct URL and sends JSON content type", async () => {
    const { drdFetch } = await import("./api.js");
    await drdFetch("/api/health");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://hub.test/api/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("adds Bearer Authorization when DRD_API_KEY is set", async () => {
    process.env.DRD_API_KEY = "secret-key";
    vi.resetModules();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    ) as typeof fetch;

    const { drdFetch } = await import("./api.js");
    await drdFetch("/api/meta");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://hub.test/api/meta",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-key",
        }),
      })
    );
  });

  it("falls back to API_KEY when DRD_API_KEY unset", async () => {
    process.env.API_KEY = "fallback-key";
    vi.resetModules();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    ) as typeof fetch;

    const { drdFetch } = await import("./api.js");
    await drdFetch("/api/domains");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://hub.test/api/domains",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer fallback-key",
        }),
      })
    );
  });

  it("stringifies object body and merges headers", async () => {
    process.env.DRD_API_KEY = "k";
    vi.resetModules();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ created: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    ) as typeof fetch;

    const { drdFetch } = await import("./api.js");
    await drdFetch("/api/initiatives", {
      method: "POST",
      body: { title: "x", domainId: "d1" },
      headers: { "X-Custom": "1" },
    });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ title: "x", domainId: "d1" }),
      headers: expect.objectContaining({
        "Content-Type": "application/json",
        Authorization: "Bearer k",
        "X-Custom": "1",
      }),
    });
  });

  it("returns undefined for 204 No Content", async () => {
    const { drdFetch } = await import("./api.js");
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;

    const out = await drdFetch<undefined>("/api/gone");
    expect(out).toBeUndefined();
  });

  it("throws on non-OK with response body in message", async () => {
    const { drdFetch } = await import("./api.js");
    globalThis.fetch = vi.fn(
      async () => new Response("Tenant context required", { status: 400, statusText: "Bad Request" })
    ) as typeof fetch;

    await expect(drdFetch("/api/meta")).rejects.toThrow(/Tymio API 400/);
    await expect(drdFetch("/api/meta")).rejects.toThrow(/Tenant context required/);
  });
});

describe("drdFetchText", () => {
  beforeEach(() => {
    process.env.DRD_API_BASE_URL = "http://hub.test";
  });

  it("returns text body on success", async () => {
    globalThis.fetch = vi.fn(async () => new Response("# Guide\n", { status: 200 })) as typeof fetch;
    const { drdFetchText } = await import("./api.js");
    const text = await drdFetchText("/api/agent/coding-guide");
    expect(text).toBe("# Guide\n");
  });

  it("throws on non-OK", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 403 })) as typeof fetch;
    const { drdFetchText } = await import("./api.js");
    await expect(drdFetchText("/api/x")).rejects.toThrow(/Tymio API 403/);
  });
});

describe("getBaseUrl and hasApiKey", () => {
  it("hasApiKey is false when no key env", async () => {
    const { hasApiKey, getBaseUrl } = await import("./api.js");
    expect(hasApiKey()).toBe(false);
    expect(getBaseUrl()).toMatch(/localhost:8080/);
  });

  it("hasApiKey is true when DRD_API_KEY set", async () => {
    process.env.DRD_API_KEY = "x";
    vi.resetModules();
    const { hasApiKey } = await import("./api.js");
    expect(hasApiKey()).toBe(true);
  });
});
