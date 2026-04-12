import type { Express, Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "./requireTenant.js";
import { resolveWorkspacePathTenant } from "./workspacePathTenant.js";

/**
 * Registers the same router at legacy `/api/...` (header/session tenant) and at
 * `/t/:workspaceSlug/api/...` (path-canonical tenant).
 */
export function mountTenantScopedLegacyAndWorkspace(
  app: Express,
  legacyMount: (path: string, router: Router) => void,
  apiPath: string,
  router: Router
): void {
  legacyMount(apiPath, router);
  const suffix = apiPath === "/api" ? "" : apiPath.slice("/api".length);
  app.use(
    `/t/:workspaceSlug/api${suffix}`,
    requireAuth,
    resolveWorkspacePathTenant,
    requireTenant,
    router
  );
}
