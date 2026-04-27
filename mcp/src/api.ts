/**
 * Minimal Tymio hub API client for the stdio MCP server.
 * Prefers TYMIO_API_BASE_URL / TYMIO_API_KEY; DRD_* names remain as a temporary fallback (deprecated).
 */

let warnedLegacyEnv = false;
function warnLegacyDrdEnvOnce(used: "base" | "key"): void {
  if (warnedLegacyEnv) return;
  warnedLegacyEnv = true;
  process.stderr.write(
    `[tymio-mcp] Deprecated: ${used === "base" ? "DRD_API_BASE_URL" : "DRD_API_KEY"} is set; use TYMIO_${used === "base" ? "API_BASE_URL" : "API_KEY"} instead (same value). Legacy names will be removed in a future major version.\n`
  );
}

/** Hub origin (no `/mcp` path). Stdio bridge calls REST under `/api/...`. */
function resolveBaseUrl(): string {
  const v =
    process.env.TYMIO_API_BASE_URL?.trim() || process.env.DRD_API_BASE_URL?.trim();
  if (process.env.DRD_API_BASE_URL?.trim() && !process.env.TYMIO_API_BASE_URL?.trim()) {
    warnLegacyDrdEnvOnce("base");
  }
  return v || "https://tymio.app";
}

function resolveApiKey(): string {
  const v =
    process.env.TYMIO_API_KEY?.trim() ||
    process.env.DRD_API_KEY?.trim() ||
    process.env.API_KEY?.trim() ||
    "";
  if (process.env.DRD_API_KEY?.trim() && !process.env.TYMIO_API_KEY?.trim()) {
    warnLegacyDrdEnvOnce("key");
  }
  return v;
}

const baseUrl = resolveBaseUrl();
const apiKey = resolveApiKey();

/** Set by API-key stdio after resolving slug → tenant id (never send cross-tenant requests). */
let bridgeTenantHeaders: Record<string, string> = {};

export function setApiKeyBridgeTenantId(tenantId: string): void {
  bridgeTenantHeaders = { "X-Tenant-Id": tenantId };
}

export function clearApiKeyBridgeTenant(): void {
  bridgeTenantHeaders = {};
}

function headers(): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...bridgeTenantHeaders
  };
  if (apiKey) h["Authorization"] = `Bearer ${apiKey}`;
  return h;
}

/** JSON-friendly body; plain objects are stringified. */
export type TymioFetchInit = Omit<RequestInit, "body"> & {
  body?: string | Record<string, unknown>;
};

/** @deprecated Use `tymioFetch` (same function). */
export type DrdFetchInit = TymioFetchInit;

export async function tymioFetch<T>(path: string, init?: TymioFetchInit): Promise<T> {
  const { body, ...rest } = init ?? {};
  const bodyInit: BodyInit | undefined =
    body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    body: bodyInit,
    headers: { ...headers(), ...(rest.headers ?? ({} as HeadersInit)) }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tymio API ${res.status}: ${body || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** @deprecated Use `tymioFetch` */
export const drdFetch = tymioFetch;

/** Plain text body (e.g. Markdown agent brief). */
export async function tymioFetchText(path: string, init?: RequestInit): Promise<string> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? ({} as HeadersInit)) }
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Tymio API ${res.status}: ${errBody || res.statusText}`);
  }
  return res.text();
}

/** @deprecated Use `tymioFetchText` */
export const drdFetchText = tymioFetchText;

export function getBaseUrl(): string {
  return baseUrl;
}

export function hasApiKey(): boolean {
  return Boolean(apiKey);
}
