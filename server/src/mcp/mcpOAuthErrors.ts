import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

export type McpRefreshFailureReason =
  | "not_found"
  | "client_mismatch"
  | "expired"
  | "reuse_detected"
  | "user_inactive"
  | "concurrent_refresh";

const MESSAGES: Record<McpRefreshFailureReason, string> = {
  not_found: "Invalid refresh token",
  client_mismatch: "Refresh token was not issued to this client",
  expired: "Refresh token expired",
  reuse_detected: "Refresh token has been revoked; sign in again",
  user_inactive: "User not found or inactive",
  concurrent_refresh: "Refresh token is no longer valid; retry or sign in again"
};

export function mcpRefreshGrantError(
  reason: McpRefreshFailureReason,
  meta?: Record<string, string | undefined>
): InvalidGrantError {
  console.warn("[MCP OAuth] Refresh grant rejected:", reason, meta ?? "");
  return new InvalidGrantError(MESSAGES[reason]);
}
