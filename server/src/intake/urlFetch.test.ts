import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildFetchedFilename,
  countRecentUrlFetches,
  detectUrlProvider,
  fetchUrlContent,
  htmlToPlainText,
  isBlockedIp,
  mergeRawTextWithFetch,
  assertUrlSafeForFetch,
  URL_FETCH_MAX_BYTES
} from "./urlFetch.js";

describe("urlFetch helpers", () => {
  it("detects providers from host", () => {
    expect(detectUrlProvider("www.notion.so")).toBe("notion");
    expect(detectUrlProvider("docs.google.com")).toBe("google_docs");
    expect(detectUrlProvider("acme.atlassian.net")).toBe("jira");
    expect(detectUrlProvider("app.slack.com")).toBe("slack");
    expect(detectUrlProvider("example.com")).toBe("generic");
  });

  it("blocks private and metadata IPs", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.0.0.5")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("172.16.0.1")).toBe(true);
    expect(isBlockedIp("169.254.169.254")).toBe(true);
    expect(isBlockedIp("100.64.1.1")).toBe(true);
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("1.1.1.1")).toBe(false);
  });

  it("rejects loopback URLs without fetch", async () => {
    const r = await assertUrlSafeForFetch("http://127.0.0.1/secret");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe("skipped");
  });

  it("rejects localhost hostname", async () => {
    const r = await assertUrlSafeForFetch("http://localhost/x");
    expect(r.ok).toBe(false);
  });

  it("converts HTML to plain text", () => {
    const text = htmlToPlainText(
      "<html><head><title>Spec</title><script>evil()</script></head><body><h1>Hi</h1><p>Body</p></body></html>"
    );
    expect(text).toContain("Spec");
    expect(text).toContain("Hi");
    expect(text).toContain("Body");
    expect(text).not.toContain("evil");
  });

  it("merges rawText with source stub once", () => {
    const once = mergeRawTextWithFetch("hello", "https://ex.com/a", "page");
    expect(once).toContain("Source: https://ex.com/a");
    expect(once).toContain("hello");
    const twice = mergeRawTextWithFetch(once, "https://ex.com/a", "page2");
    expect(twice).toBe(once);
  });

  it("counts recent urlFetches in window", () => {
    const now = Date.parse("2026-09-29T12:00:00.000Z");
    const n = countRecentUrlFetches(
      [
        { fetchedAt: "2026-09-29T11:30:00.000Z" },
        { fetchedAt: "2026-09-28T11:30:00.000Z" },
        { fetchedAt: "bad" }
      ],
      now
    );
    expect(n).toBe(1);
  });

  it("builds safe filenames", () => {
    const name = buildFetchedFilename(new URL("https://docs.example.com/path/login"), "txt");
    expect(name).toMatch(/^fetched-docs\.example\.com/);
    expect(name.endsWith(".txt")).toBe(true);
  });
});

describe("fetchUrlContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns needs_auth for Notion without attempting network", async () => {
    const fetchMock = vi.fn();
    const out = await fetchUrlContent("https://www.notion.so/acme/secret-page", {
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe("needs_auth");
      expect(out.provider).toBe("notion");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches public HTML and normalizes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: {
        get: (k: string) => (k.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null)
      },
      body: null,
      arrayBuffer: async () =>
        Buffer.from("<html><title>T</title><body><p>Hello world</p></body></html>")
    });
    const out = await fetchUrlContent("https://example.com/page", {
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.normalizedText).toContain("Hello world");
      expect(out.filename).toContain("example.com");
      expect(out.httpStatus).toBe(200);
    }
  });

  it("fails on oversized content-length", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: {
        get: (k: string) => {
          if (k.toLowerCase() === "content-type") return "text/plain";
          if (k.toLowerCase() === "content-length") return String(URL_FETCH_MAX_BYTES + 1);
          return null;
        }
      },
      body: null,
      arrayBuffer: async () => Buffer.from("x")
    });
    const out = await fetchUrlContent("https://example.com/big", {
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/too large/i);
  });

  it("maps 403 to needs_auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 403,
      ok: false,
      headers: { get: () => null },
      body: null,
      arrayBuffer: async () => Buffer.alloc(0)
    });
    const out = await fetchUrlContent("https://example.com/private", {
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe("needs_auth");
  });

  it("rejects redirect to private IP", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 302,
      ok: false,
      headers: {
        get: (k: string) => (k.toLowerCase() === "location" ? "http://127.0.0.1/admin" : null)
      },
      body: null,
      arrayBuffer: async () => Buffer.alloc(0)
    });
    const out = await fetchUrlContent("https://example.com/r", {
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe("skipped");
  });
});
