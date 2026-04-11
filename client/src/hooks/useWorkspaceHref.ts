import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { withWorkspacePrefix } from "../lib/workspacePath";

function buildWorkspaceHref(workspaceSlug: string | undefined, logicalPath: string): string {
  const q = logicalPath.indexOf("?");
  const pathOnly = q >= 0 ? logicalPath.slice(0, q) : logicalPath;
  const query = q >= 0 ? logicalPath.slice(q) : "";
  const normalized = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  if (!workspaceSlug) return logicalPath.startsWith("/") ? logicalPath : `/${logicalPath}`;
  return withWorkspacePrefix(workspaceSlug, normalized) + query;
}

/** Build `/t/:workspaceSlug/...` when inside hub routes; supports `?query` on `logicalPath`. */
export function useWorkspaceHref(logicalPath: string): string {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  return buildWorkspaceHref(workspaceSlug, logicalPath);
}

/** Stable `(path) => href` for maps and dynamic IDs. */
export function useWorkspaceLinkBuilder(): (logicalPath: string) => string {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  return useCallback((logicalPath: string) => buildWorkspaceHref(workspaceSlug, logicalPath), [workspaceSlug]);
}
