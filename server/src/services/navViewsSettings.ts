import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

/** Must match client `MANAGED_NAV_PATHS` and `server/src/routes/ui-settings.ts`. */
export const MANAGED_NAV_PATHS = [
  "/",
  "/priority",
  "/raci",
  "/status-kanban",
  "/accountability",
  "/kpi-dashboard",
  "/heatmap",
  "/buyer-user",
  "/gaps",
  "/product-explorer",
  "/workspace-settings",
  "/accounts",
  "/demands",
  "/partners",
  "/campaigns",
  "/milestones",
  "/calendar",
  "/gantt"
] as const;

export type ManagedNavPath = (typeof MANAGED_NAV_PATHS)[number];

const ALLOWED = new Set<string>(MANAGED_NAV_PATHS);

export function normalizeHiddenNavPaths(raw: unknown): ManagedNavPath[] {
  if (!Array.isArray(raw)) return [];
  const out: ManagedNavPath[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    if (typeof p !== "string" || !ALLOWED.has(p) || seen.has(p)) continue;
    seen.add(p);
    out.push(p as ManagedNavPath);
  }
  return out;
}

/** Tenant.settings JSON: extra hidden paths for this workspace (merged with platform). */
export function tenantHiddenNavPathsFromSettings(settings: unknown): ManagedNavPath[] {
  if (!settings || typeof settings !== "object") return [];
  const o = settings as Record<string, unknown>;
  return normalizeHiddenNavPaths(o.hiddenNavPaths);
}

export function mergeHiddenNavPaths(
  platform: ManagedNavPath[],
  tenantExtra: ManagedNavPath[]
): ManagedNavPath[] {
  const seen = new Set<string>();
  const out: ManagedNavPath[] = [];
  for (const p of platform) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  for (const p of tenantExtra) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

export function atLeastOneNavVisible(mergedHidden: ManagedNavPath[]): boolean {
  return mergedHidden.length < MANAGED_NAV_PATHS.length;
}

export async function loadPlatformHiddenNavPaths(): Promise<ManagedNavPath[]> {
  const row = await prisma.uiSettings.findUnique({ where: { id: "default" } });
  return normalizeHiddenNavPaths(row?.hiddenNavPaths);
}

export async function loadTenantExtraHiddenNavPaths(tenantId: string): Promise<ManagedNavPath[]> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  return tenantHiddenNavPathsFromSettings(row?.settings);
}

export async function persistTenantExtraHiddenNavPaths(
  tenantId: string,
  tenantExtra: ManagedNavPath[]
): Promise<void> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const prev =
    row?.settings && typeof row.settings === "object" && !Array.isArray(row.settings)
      ? (row.settings as Record<string, unknown>)
      : {};
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: { ...prev, hiddenNavPaths: tenantExtra } as Prisma.InputJsonValue
    }
  });
}
