/** Shared OAuth user id extraction for Streamable HTTP MCP (global + workspace servers). */
export function getMcpOAuthUserId(ctx: unknown): string {
  const extra = (ctx as { authInfo?: { extra?: Record<string, unknown> } })?.authInfo?.extra;
  if (typeof extra?.userId !== "string") throw new Error("Not authenticated");
  return extra.userId;
}
