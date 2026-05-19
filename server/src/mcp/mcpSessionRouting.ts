import type { Request } from "express";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/** True when the JSON-RPC body is an MCP `initialize` request (single or batch). */
export function bodyIsMcpInitialize(body: unknown): boolean {
  const isInit = (msg: unknown): boolean =>
    typeof msg === "object" &&
    msg !== null &&
    (msg as { method?: string }).method === "initialize";

  if (body == null) return false;
  if (Array.isArray(body)) return body.some(isInit);
  return isInit(body);
}

/**
 * Cursor and other clients may open a new GET SSE while the server still tracks the
 * previous standalone stream (proxy idle timeout, reconnect, duplicate client).
 * The MCP SDK returns 409 in that case — evict the stale stream first.
 */
export function prepareExistingMcpTransportForRequest(
  transport: StreamableHTTPServerTransport,
  req: Request
): void {
  if (req.method === "GET") {
    transport.closeStandaloneSSEStream();
  }
}

/**
 * When the hub restarts or the request hits another instance, clients keep a stale
 * `mcp-session-id`. Allow a fresh initialize instead of a hard 404.
 */
export function shouldStartNewMcpSessionAfterStaleId(
  sessionId: string | undefined,
  hasTransport: boolean,
  body: unknown
): boolean {
  return Boolean(sessionId && !hasTransport && bodyIsMcpInitialize(body));
}
