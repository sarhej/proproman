import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const URL_FETCH_MAX_BYTES = 1 * 1024 * 1024;
export const URL_FETCH_TIMEOUT_MS = 10_000;
export const URL_FETCH_MAX_REDIRECTS = 3;
export const URL_FETCH_MAX_PER_SESSION_HOUR = 10;
export const URL_FETCH_RAW_TEXT_EXCERPT = 8_000;

export type UrlFetchProvider =
  | "generic"
  | "notion"
  | "google_docs"
  | "jira"
  | "slack"
  | "unknown";

export type UrlFetchStatus = "ok" | "failed" | "skipped" | "needs_auth";

export type UrlFetchRecord = {
  url: string;
  status: UrlFetchStatus;
  provider: UrlFetchProvider;
  httpStatus: number | null;
  fetchedAt: string;
  normalizedTextRef: string | null;
  error: string | null;
};

export type UrlFetchSuccess = {
  ok: true;
  provider: UrlFetchProvider;
  httpStatus: number;
  contentType: string | null;
  normalizedText: string;
  filename: string;
};

export type UrlFetchFailure = {
  ok: false;
  status: Exclude<UrlFetchStatus, "ok">;
  provider: UrlFetchProvider;
  httpStatus: number | null;
  error: string;
};

export type UrlFetchOutcome = UrlFetchSuccess | UrlFetchFailure;

const AUTH_PROVIDERS: ReadonlySet<UrlFetchProvider> = new Set([
  "notion",
  "google_docs",
  "jira",
  "slack"
]);

/** Soft user-facing reason when fetch did not yield usable text (no "sign in" scare). */
export const URL_FETCH_PASTE_HINT =
  "We could not open that link automatically. Paste the page text below — you can keep going.";

/** Detect known hosts for audit / messaging. Public shares are still fetched. */
export function detectUrlProvider(hostname: string): UrlFetchProvider {
  const h = hostname.toLowerCase();
  if (h === "notion.so" || h.endsWith(".notion.so") || h.endsWith(".notion.site")) {
    return "notion";
  }
  if (
    h === "docs.google.com" ||
    h === "drive.google.com" ||
    h.endsWith(".googleusercontent.com")
  ) {
    return "google_docs";
  }
  if (
    h.endsWith(".atlassian.net") ||
    h.includes("jira.") ||
    h === "jira.com" ||
    h.endsWith(".jira.com")
  ) {
    return "jira";
  }
  if (
    h === "slack.com" ||
    h.endsWith(".slack.com") ||
    h === "app.slack.com"
  ) {
    return "slack";
  }
  return "generic";
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

/** Block loopback, RFC1918, link-local, CGNAT, metadata, and IPv6 locals. */
export function isBlockedIp(ip: string): boolean {
  const normalized = ip.replace(/^\[|\]$/g, "").toLowerCase();

  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:")) {
    return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    // Unique local addresses fc00::/7
    return true;
  }
  // IPv4-mapped IPv6 ::ffff:x.x.x.x
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIp(mapped[1]!);

  const n = ipv4ToInt(normalized);
  if (n === null) {
    // Non-IPv4 literal we couldn't parse — if isIP says IPv6, block non-global conservatively
    if (isIP(normalized) === 6) {
      return (
        normalized === "::1" ||
        normalized.startsWith("fe80:") ||
        normalized.startsWith("fc") ||
        normalized.startsWith("fd")
      );
    }
    return true;
  }

  // 0.0.0.0/8, 127.0.0.0/8
  if ((n >>> 24) === 0 || (n >>> 24) === 127) return true;
  // 10.0.0.0/8
  if ((n >>> 24) === 10) return true;
  // 172.16.0.0/12
  if ((n >>> 24) === 172 && ((n >>> 16) & 0xf0) === 16) return true;
  // 192.168.0.0/16
  if ((n >>> 24) === 192 && ((n >>> 16) & 0xff) === 168) return true;
  // 169.254.0.0/16 link-local + AWS metadata
  if ((n >>> 24) === 169 && ((n >>> 16) & 0xff) === 254) return true;
  // 100.64.0.0/10 CGNAT
  if ((n >>> 24) === 100 && ((n >>> 22) & 0x3) === 1) return true;

  return false;
}

export async function assertUrlSafeForFetch(urlString: string): Promise<
  | { ok: true; url: URL; provider: UrlFetchProvider }
  | { ok: false; status: "skipped"; provider: UrlFetchProvider; error: string }
> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, status: "skipped", provider: "unknown", error: "Invalid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      status: "skipped",
      provider: "unknown",
      error: "Only http and https URLs are supported"
    };
  }

  const host = url.hostname;
  const provider = detectUrlProvider(host);

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return { ok: false, status: "skipped", provider, error: "Unsupported host" };
  }

  if (isIP(host) && isBlockedIp(host)) {
    return { ok: false, status: "skipped", provider, error: "Unsupported host" };
  }

  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some((r) => isBlockedIp(r.address))) {
      return { ok: false, status: "skipped", provider, error: "Unsupported host" };
    }
  } catch {
    return { ok: false, status: "skipped", provider, error: "Could not resolve host" };
  }

  return { ok: true, url, provider };
}

export function countRecentUrlFetches(
  urlFetches: unknown,
  nowMs = Date.now(),
  windowMs = 60 * 60 * 1000
): number {
  if (!Array.isArray(urlFetches)) return 0;
  return urlFetches.filter((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const at = (entry as { fetchedAt?: unknown }).fetchedAt;
    if (typeof at !== "string") return false;
    const t = Date.parse(at);
    return Number.isFinite(t) && nowMs - t <= windowMs;
  }).length;
}

export function htmlToPlainText(html: string): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]!).trim() : "";
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n");
  text = stripTags(text);
  text = decodeBasicEntities(text);
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (title && !text.startsWith(title)) {
    return `${title}\n\n${text}`.trim();
  }
  return text;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

export function buildFetchedFilename(url: URL, ext: "txt" | "md"): string {
  const host = url.hostname.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 40);
  const pathSlug = url.pathname
    .replace(/\/+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const base = pathSlug ? `fetched-${host}-${pathSlug}` : `fetched-${host}`;
  return `${base}.${ext}`.slice(0, 180);
}

export function mergeRawTextWithFetch(existing: string, sourceUrl: string, excerpt: string): string {
  const block = `Source: ${sourceUrl}\n\n${excerpt}`.trim();
  const trimmed = existing.trim();
  if (!trimmed) return block.slice(0, 100_000);
  if (trimmed.includes(`Source: ${sourceUrl}`)) {
    return trimmed;
  }
  return `${trimmed}\n\n---\n\n${block}`.slice(0, 100_000);
}

type FetchLike = typeof fetch;

/**
 * Fetch and normalize remote content for intake.
 * Tries any safe public http(s) URL (including Notion/Docs share links).
 * If the page is private or empty, returns a soft failure so the user can paste text.
 */
export async function fetchUrlContent(
  urlString: string,
  opts?: { fetchImpl?: FetchLike; now?: () => Date }
): Promise<UrlFetchOutcome> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const safe = await assertUrlSafeForFetch(urlString);
  if (!safe.ok) {
    return {
      ok: false,
      status: safe.status,
      provider: safe.provider,
      httpStatus: null,
      error: URL_FETCH_PASTE_HINT
    };
  }

  const { url, provider } = safe;

  let current = url;
  let httpStatus: number | null = null;
  let contentType: string | null = null;
  let bodyBuf: Buffer | null = null;

  for (let hop = 0; hop <= URL_FETCH_MAX_REDIRECTS; hop++) {
    const hopSafe = await assertUrlSafeForFetch(current.toString());
    if (!hopSafe.ok) {
      return {
        ok: false,
        status: "skipped",
        provider,
        httpStatus: null,
        error: URL_FETCH_PASTE_HINT
      };
    }
    current = hopSafe.url;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/plain, text/markdown, text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
          "User-Agent": "TymioIntakeBot/1.0 (+https://tymio.app)"
        }
      });
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        status: "failed",
        provider,
        httpStatus: null,
        error: aborted ? "That link took too long. Paste the text below instead." : URL_FETCH_PASTE_HINT
      };
    } finally {
      clearTimeout(timer);
    }

    httpStatus = res.status;

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) {
        return {
          ok: false,
          status: "failed",
          provider,
          httpStatus,
          error: URL_FETCH_PASTE_HINT
        };
      }
      try {
        current = new URL(loc, current);
      } catch {
        return {
          ok: false,
          status: "failed",
          provider,
          httpStatus,
          error: URL_FETCH_PASTE_HINT
        };
      }
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: AUTH_PROVIDERS.has(provider) ? "needs_auth" : "failed",
        provider,
        httpStatus,
        error: URL_FETCH_PASTE_HINT
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: "failed",
        provider,
        httpStatus,
        error: URL_FETCH_PASTE_HINT
      };
    }

    contentType = res.headers.get("content-type");
    const cl = res.headers.get("content-length");
    if (cl && Number(cl) > URL_FETCH_MAX_BYTES) {
      return {
        ok: false,
        status: "failed",
        provider,
        httpStatus,
        error: "That page is too large to pull in. Paste a shorter excerpt below."
      };
    }

    const reader = res.body?.getReader?.();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > URL_FETCH_MAX_BYTES) {
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            return {
              ok: false,
              status: "failed",
              provider,
              httpStatus,
              error: "That page is too large to pull in. Paste a shorter excerpt below."
            };
          }
          chunks.push(value);
        }
      }
      bodyBuf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    } else {
      const ab = await res.arrayBuffer();
      if (ab.byteLength > URL_FETCH_MAX_BYTES) {
        return {
          ok: false,
          status: "failed",
          provider,
          httpStatus,
          error: "That page is too large to pull in. Paste a shorter excerpt below."
        };
      }
      bodyBuf = Buffer.from(ab);
    }
    break;
  }

  if (!bodyBuf) {
    return {
      ok: false,
      status: "failed",
      provider,
      httpStatus,
      error: URL_FETCH_PASTE_HINT
    };
  }

  const ct = (contentType ?? "").toLowerCase();
  if (
    ct.includes("application/pdf") ||
    ct.includes("application/octet-stream") ||
    ct.startsWith("image/") ||
    ct.startsWith("audio/") ||
    ct.startsWith("video/") ||
    ct.includes("application/zip")
  ) {
    return {
      ok: false,
      status: "failed",
      provider,
      httpStatus,
      error: "That link is a file we cannot read here. Upload it as an attachment instead."
    };
  }

  const raw = bodyBuf.toString("utf8");
  let normalized: string;
  let ext: "txt" | "md" = "txt";

  if (ct.includes("text/html") || ct.includes("application/xhtml") || /^\s*</.test(raw)) {
    normalized = htmlToPlainText(raw);
  } else if (ct.includes("markdown") || ct.includes("text/md")) {
    normalized = raw.trim();
    ext = "md";
  } else {
    normalized = raw.trim();
  }

  if (!normalized || looksLikeLoginWall(normalized)) {
    return {
      ok: false,
      status: AUTH_PROVIDERS.has(provider) ? "needs_auth" : "failed",
      provider,
      httpStatus,
      error: URL_FETCH_PASTE_HINT
    };
  }

  return {
    ok: true,
    provider,
    httpStatus: httpStatus ?? 200,
    contentType,
    normalizedText: normalized.slice(0, URL_FETCH_MAX_BYTES),
    filename: buildFetchedFilename(current, ext)
  };
}

/** Heuristic: short page text that is mostly a login / access gate. */
export function looksLikeLoginWall(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  if (t.length > 800) return false;
  const gate =
    /\b(sign in|log in|log into|login to|create an account|request access|you need permission|access denied|unauthorized)\b/.test(
      t
    );
  // Only treat as a wall when gate language dominates a short page.
  return gate && t.length < 600;
}
