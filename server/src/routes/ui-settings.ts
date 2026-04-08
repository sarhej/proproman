/**
 * Navigation visibility (shell routes):
 * - `UiSettings` row `default` = platform-wide hidden paths (security ceiling). Not deprecated:
 *   it is the operator-controlled baseline merged into every workspace.
 * - `Tenant.settings.hiddenNavPaths` = additional hidden paths for that workspace only.
 * - Effective hidden set = union(platform, tenant). Tenants cannot un-hide platform paths.
 */
import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { logAudit } from "../services/audit.js";
import { requireTenant, getTenantId } from "../tenant/requireTenant.js";
import {
  MANAGED_NAV_PATHS,
  atLeastOneNavVisible,
  loadPlatformHiddenNavPaths,
  loadTenantExtraHiddenNavPaths,
  mergeHiddenNavPaths,
  normalizeHiddenNavPaths,
  persistTenantExtraHiddenNavPaths,
  type ManagedNavPath
} from "../services/navViewsSettings.js";

export { MANAGED_NAV_PATHS } from "../services/navViewsSettings.js";

const pathEnum = z.enum(MANAGED_NAV_PATHS as unknown as [ManagedNavPath, ...ManagedNavPath[]]);

const platformPutSchema = z
  .object({
    hiddenNavPaths: z.array(pathEnum)
  })
  .refine((d) => d.hiddenNavPaths.length < MANAGED_NAV_PATHS.length, {
    message: "At least one navigation view must remain visible for non–super-admin users."
  });

const workspacePutSchema = z.object({
  hiddenNavPaths: z.array(pathEnum)
});

export const uiSettingsRouter = Router();
uiSettingsRouter.use(requireAuth);

/**
 * Effective nav visibility for the resolved workspace (X-Tenant-Id / session).
 * Merge: platform (UiSettings singleton) ∪ tenant extra (Tenant.settings.hiddenNavPaths).
 * Platform row is not "legacy" — it is the security ceiling; tenant cannot un-hide platform paths.
 */
uiSettingsRouter.get("/", async (req, res) => {
  const platformHidden = await loadPlatformHiddenNavPaths();
  let tenantExtra: ManagedNavPath[] = [];
  if (req.tenantContext) {
    tenantExtra = await loadTenantExtraHiddenNavPaths(req.tenantContext.tenantId);
  }
  const merged = mergeHiddenNavPaths(platformHidden, tenantExtra);
  res.json({
    hiddenNavPaths: merged,
    globalHiddenNavPaths: platformHidden,
    tenantHiddenNavPaths: tenantExtra
  });
});

/** Platform operator: sets hidden paths for all workspaces (merged ∪ tenant extras still apply on top). */
uiSettingsRouter.put("/", requireRole(UserRole.SUPER_ADMIN), async (req, res) => {
  const parsed = platformPutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { hiddenNavPaths } = parsed.data;
  const row = await prisma.uiSettings.upsert({
    where: { id: "default" },
    create: { id: "default", hiddenNavPaths },
    update: { hiddenNavPaths }
  });
  await logAudit(req.user!.id, "UPDATED", "UI_SETTINGS", "default", { hiddenNavPaths });
  res.json({ hiddenNavPaths: normalizeHiddenNavPaths(row.hiddenNavPaths) });
});

/** Workspace OWNER/ADMIN: extra hidden paths for this tenant only (union with platform). */
uiSettingsRouter.put(
  "/workspace",
  requireTenant,
  requireWorkspaceStructureWrite(),
  async (req, res) => {
    const parsed = workspacePutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const tenantId = getTenantId(req);
    const platformHidden = await loadPlatformHiddenNavPaths();
    const tenantExtra = parsed.data.hiddenNavPaths;
    const merged = mergeHiddenNavPaths(platformHidden, tenantExtra);
    if (!atLeastOneNavVisible(merged)) {
      res.status(400).json({
        error: "At least one navigation view must remain visible for non–super-admin users."
      });
      return;
    }
    await persistTenantExtraHiddenNavPaths(tenantId, tenantExtra);
    await logAudit(req.user!.id, "UPDATED", "UI_SETTINGS", `tenant:${tenantId}`, {
      tenantId,
      tenantHiddenNavPaths: tenantExtra
    });
    res.json({
      hiddenNavPaths: merged,
      globalHiddenNavPaths: platformHidden,
      tenantHiddenNavPaths: tenantExtra
    });
  }
);
