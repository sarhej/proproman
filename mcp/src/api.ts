/**
 * Minimal Tymio hub API client for the stdio MCP server. Uses DRD_API_BASE_URL and DRD_API_KEY from env.
 */

/** Hub origin (no `/mcp` path). Stdio bridge calls REST under `/api/...`. */
const baseUrl = process.env.DRD_API_BASE_URL ?? "https://tymio.app";
const apiKey = process.env.DRD_API_KEY ?? process.env.API_KEY ?? "";

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
export type DrdFetchInit = Omit<RequestInit, "body"> & {
  body?: string | Record<string, unknown>;
};

export async function drdFetch<T>(path: string, init?: DrdFetchInit): Promise<T> {
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

/** Plain text body (e.g. Markdown agent brief). */
export async function drdFetchText(path: string, init?: RequestInit): Promise<string> {
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

export function getBaseUrl(): string {
  return baseUrl;
}

export function hasApiKey(): boolean {
  return Boolean(apiKey);
}
