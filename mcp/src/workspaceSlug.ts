import { z } from "zod";

/** Matches hub workspace slug rules (see server tenant slug validation). */
export const WORKSPACE_SLUG_ZOD = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9-]+$/, "Workspace slug: 2–50 chars, lowercase a-z, digits, hyphens only.");

export function isValidWorkspaceSlugFormat(slug: string): boolean {
  return WORKSPACE_SLUG_ZOD.safeParse(slug).success;
}

/**
 * Pinned slug for this stdio process: every proxied MCP tool call must use this workspace.
 * Set `TYMIO_MCP_SKIP_WORKSPACE_PINNING=1` only in tests.
 */
export function readPinnedWorkspaceSlugForStdio(): string | null {
  if (process.env.TYMIO_MCP_SKIP_WORKSPACE_PINNING === "1") {
    return null;
  }
  const raw = process.env.TYMIO_WORKSPACE_SLUG?.trim() || process.env.DRD_WORKSPACE_SLUG?.trim();
  if (!raw) {
    process.stderr.write(
      "[tymio-mcp] Missing TYMIO_WORKSPACE_SLUG or DRD_WORKSPACE_SLUG. Set this to your hub workspace slug (e.g. acme-corp). Required so this MCP server only operates on one workspace; tool args must match.\n"
    );
    process.exit(1);
  }
  const parsed = WORKSPACE_SLUG_ZOD.safeParse(raw);
  if (!parsed.success) {
    process.stderr.write(
      `[tymio-mcp] Invalid workspace slug: ${JSON.stringify(raw)}. Use 2–50 characters: lowercase letters, digits, hyphens only.\n`
    );
    process.exit(1);
  }
  return parsed.data;
}

/** Enforce agent-supplied slug matches pinned CLI config (defense in depth vs hub session). */
export function assertToolArgsMatchPinnedWorkspace(
  args: unknown,
  pinnedSlug: string,
  toolName: string
): void {
  if (!args || typeof args !== "object") {
    throw new Error(`[tymio-mcp] ${toolName}: missing or invalid arguments object.`);
  }
  const o = args as Record<string, unknown>;
  const slug = o.workspaceSlug;
  if (typeof slug !== "string") {
    throw new Error(
      `[tymio-mcp] ${toolName}: workspaceSlug is required on every tool call (string, must match ${pinnedSlug}).`
    );
  }
  const t = slug.trim().toLowerCase();
  if (!isValidWorkspaceSlugFormat(t)) {
    throw new Error(
      `[tymio-mcp] ${toolName}: invalid workspaceSlug format. Use 2–50 chars: lowercase a-z, digits, hyphens.`
    );
  }
  if (t !== pinnedSlug.toLowerCase()) {
    throw new Error(
      `[tymio-mcp] ${toolName}: workspaceSlug "${slug}" does not match this MCP server pin "${pinnedSlug}". Refusing cross-workspace access.`
    );
  }
}

/** After assert, remove workspaceSlug before REST bodies. */
export function omitWorkspaceSlug<T extends Record<string, unknown>>(args: T): Omit<T, "workspaceSlug"> {
  const { workspaceSlug: _, ...rest } = args;
  return rest as Omit<T, "workspaceSlug">;
}
