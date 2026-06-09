import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { defaultMcpUrl } from "../configPaths.js";
import { hasSavedOAuthTokens } from "../fileOAuthProvider.js";
import { runLoginCommand } from "../loginCommand.js";
import { hubDiscoveryMcpUrl } from "./hubUrls.js";
import { fetchMyWorkspacesViaMcp, type ListedWorkspace } from "./listMyWorkspaces.js";

/** Test-only escape hatch (not documented in user help). */
export function isBootstrapAuthSkipped(): boolean {
  return process.env.TYMIO_BOOTSTRAP_SKIP_AUTH === "1";
}

function loginMcpUrl(origin: string): URL {
  return new URL(hubDiscoveryMcpUrl(origin));
}

/**
 * Ensure OAuth tokens exist before pinning a workspace slug in MCP config.
 * When `forceLogin` is true, runs browser OAuth even if tokens are already cached.
 */
export async function ensureBootstrapOAuth(options: {
  origin: string;
  dryRun: boolean;
  forceLogin: boolean;
}): Promise<boolean> {
  if (isBootstrapAuthSkipped()) {
    return true;
  }

  if (options.forceLogin) {
    if (options.dryRun) {
      process.stderr.write("[dry-run] would run tymio-mcp login\n");
      return true;
    }
    process.stderr.write("Running OAuth login…\n");
    await runLoginCommand(loginMcpUrl(options.origin));
    if (!hasSavedOAuthTokens()) {
      process.stderr.write("OAuth login did not save tokens. Cannot pin workspace slug.\n");
      return false;
    }
    return true;
  }

  if (hasSavedOAuthTokens()) {
    return true;
  }

  if (options.dryRun) {
    process.stderr.write(
      "[dry-run] would run tymio-mcp login (required before pinning a workspace slug)\n"
    );
    return true;
  }

  process.stderr.write("Running OAuth login (required before pinning a workspace slug)…\n");
  await runLoginCommand(defaultMcpUrl());
  if (!hasSavedOAuthTokens()) {
    process.stderr.write("OAuth login did not save tokens. Cannot pin workspace slug.\n");
    return false;
  }
  return true;
}

/**
 * Verify the signed-in user has ACTIVE membership for `slug` via discovery MCP.
 */
export async function verifyBootstrapWorkspaceMembership(options: {
  origin: string;
  slug: string;
  dryRun: boolean;
}): Promise<{ ok: true; workspaces: ListedWorkspace[] } | { ok: false }> {
  if (isBootstrapAuthSkipped()) {
    return { ok: true, workspaces: [] };
  }

  if (options.dryRun && !hasSavedOAuthTokens()) {
    process.stderr.write(
      `[dry-run] would verify ACTIVE membership for workspace slug "${options.slug}" via tymio_list_my_workspaces\n`
    );
    return { ok: true, workspaces: [] };
  }

  const discoveryUrl = hubDiscoveryMcpUrl(options.origin);
  let workspaces: ListedWorkspace[];
  try {
    workspaces = await fetchMyWorkspacesViaMcp(discoveryUrl);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      process.stderr.write(
        "OAuth session expired or invalid. Run: tymio-mcp logout, then tymio-mcp login (or bootstrap with --login).\n"
      );
      return { ok: false };
    }
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Failed to verify workspace membership: ${msg}\n`);
    return { ok: false };
  }

  const want = options.slug.trim().toLowerCase();
  const match = workspaces.find((w) => w.slug.toLowerCase() === want);
  if (!match) {
    const available = workspaces.length > 0 ? workspaces.map((w) => w.slug).join(", ") : "(none)";
    process.stderr.write(
      `Bootstrap refused: signed-in user has no ACTIVE membership for workspace slug "${options.slug}".\n` +
        `Your workspaces: ${available}\n` +
        `Use a slug from that list, or run: tymio-mcp logout  then  tymio-mcp login  with the correct Google account.\n`
    );
    return { ok: false };
  }

  process.stderr.write(`OAuth OK — workspace "${match.slug}" (${match.name}).\n`);
  return { ok: true, workspaces };
}
