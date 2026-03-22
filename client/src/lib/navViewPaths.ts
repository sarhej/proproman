/**
 * Primary shell routes (must match server `MANAGED_NAV_PATHS` in routes/ui-settings.ts).
 * Super-admins always see all; others hide entries listed in ui-settings.
 */
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
  "/requirements/kanban",
  "/accounts",
  "/demands",
  "/partners",
  "/campaigns",
  "/milestones",
  "/calendar",
  "/gantt"
] as const;

export type ManagedNavPath = (typeof MANAGED_NAV_PATHS)[number];

/** First shell route not in `hidden`, or null if all are hidden (invalid config). */
export function firstAvailableNavPath(hidden: Set<string>): string | null {
  for (const p of MANAGED_NAV_PATHS) {
    if (!hidden.has(p)) return p;
  }
  return null;
}
