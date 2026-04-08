/**
 * Per-browser-tab workspace for API calls. Session cookie is shared across tabs, so we send
 * `X-Tenant-Id` from sessionStorage (tab-local) to keep each tab on its chosen workspace.
 */
const STORAGE_KEY = "tymio.workspaceTenantId";

export function getWorkspaceTenantIdForApi(): string | undefined {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)?.trim();
    return v || undefined;
  } catch {
    return undefined;
  }
}

/** Call after the user picks a workspace in this tab (TenantSwitcher). */
export function setWorkspaceTenantSessionForTab(tenantId: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, tenantId);
  } catch {
    /* private mode */
  }
}

/**
 * Seed tab storage once from server active tenant when empty (first load / new tab).
 * Does not overwrite — preserves multi-tab independence after switch.
 */
export function ensureWorkspaceTenantSession(activeTenantId: string | null | undefined): void {
  try {
    if (!activeTenantId) return;
    if (sessionStorage.getItem(STORAGE_KEY)) return;
    sessionStorage.setItem(STORAGE_KEY, activeTenantId);
  } catch {
    /* private mode */
  }
}

export function clearWorkspaceTenantSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
