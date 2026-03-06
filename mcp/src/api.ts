/**
 * Minimal DrD Hub API client for MCP server. Uses DRD_API_BASE_URL and DRD_API_KEY from env.
 */

const baseUrl = process.env.DRD_API_BASE_URL ?? "http://localhost:8080";
const apiKey = process.env.DRD_API_KEY ?? "";

function headers(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h["Authorization"] = `Bearer ${apiKey}`;
  return h;
}

export async function drdFetch<T>(
  path: string,
  init?: RequestInit & { body?: string | object } | undefined
): Promise<T> {
  const { body, ...rest } = init ?? {};
  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    body: typeof body === "object" && body !== null ? JSON.stringify(body) : body,
    headers: { ...headers(), ...(rest.headers ?? ({} as HeadersInit)) }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DrD API ${res.status}: ${body || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function getBaseUrl(): string {
  return baseUrl;
}

export function hasApiKey(): boolean {
  return Boolean(apiKey);
}
