/**
 * Per-tenant atlas rebuild lifecycle (in-process).
 * Used so UI/MCP can show current | stale | rebuilding | incomplete | error.
 */

export type AtlasHealthStatus = "incomplete" | "rebuilding" | "error" | "stale" | "current";

export type AtlasHealth = {
  status: AtlasHealthStatus;
  pendingRebuild: boolean;
  compiling: boolean;
  lastRebuildAt: string | null;
  lastErrorMessage: string | null;
};

const pendingRebuildTenantIds = new Set<string>();
const compilingTenantIds = new Set<string>();
const lastRebuildAtByTenant = new Map<string, string>();
const lastErrorByTenant = new Map<string, string>();

export function markAtlasRebuildPending(tenantId: string): void {
  pendingRebuildTenantIds.add(tenantId);
}

export function clearAtlasRebuildPending(tenantId: string): void {
  pendingRebuildTenantIds.delete(tenantId);
}

export function markAtlasCompileStarted(tenantId: string): void {
  pendingRebuildTenantIds.delete(tenantId);
  compilingTenantIds.add(tenantId);
}

export function markAtlasCompileSucceeded(tenantId: string): void {
  compilingTenantIds.delete(tenantId);
  pendingRebuildTenantIds.delete(tenantId);
  lastRebuildAtByTenant.set(tenantId, new Date().toISOString());
  lastErrorByTenant.delete(tenantId);
}

export function markAtlasCompileFailed(tenantId: string, message: string): void {
  compilingTenantIds.delete(tenantId);
  lastErrorByTenant.set(tenantId, message);
}

export function isAtlasRebuildPending(tenantId: string): boolean {
  return pendingRebuildTenantIds.has(tenantId);
}

export function isAtlasCompiling(tenantId: string): boolean {
  return compilingTenantIds.has(tenantId);
}

export function getTenantAtlasRebuildMeta(tenantId: string): {
  pendingRebuild: boolean;
  compiling: boolean;
  lastRebuildAt: string | null;
  lastErrorMessage: string | null;
} {
  return {
    pendingRebuild: pendingRebuildTenantIds.has(tenantId),
    compiling: compilingTenantIds.has(tenantId),
    lastRebuildAt: lastRebuildAtByTenant.get(tenantId) ?? null,
    lastErrorMessage: lastErrorByTenant.get(tenantId) ?? null
  };
}

/** Test helper — clears all in-memory rebuild state. */
export function resetAtlasRebuildStateForTests(): void {
  pendingRebuildTenantIds.clear();
  compilingTenantIds.clear();
  lastRebuildAtByTenant.clear();
  lastErrorByTenant.clear();
}

export function computeAtlasHealth(options: {
  tenantId: string;
  compiled: boolean;
  isStale: boolean;
}): AtlasHealth {
  const meta = getTenantAtlasRebuildMeta(options.tenantId);
  const base = {
    pendingRebuild: meta.pendingRebuild,
    compiling: meta.compiling,
    lastRebuildAt: meta.lastRebuildAt,
    lastErrorMessage: meta.lastErrorMessage
  };

  if (!options.compiled) {
    return { ...base, status: "incomplete" };
  }
  if (meta.pendingRebuild || meta.compiling) {
    return { ...base, status: "rebuilding" };
  }
  if (meta.lastErrorMessage) {
    return { ...base, status: "error" };
  }
  if (options.isStale) {
    return { ...base, status: "stale" };
  }
  return { ...base, status: "current" };
}
