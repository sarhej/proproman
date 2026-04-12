import { env } from "../env.js";
import type { HubChangeEventPayload } from "../services/hubChangeHub.js";
import { subscribeAllHubChanges } from "../services/hubChangeHub.js";
import { compileWorkspaceAtlasForTenant } from "./compiler.js";

/**
 * Returns a handler suitable for `subscribeAllHubChanges`: debounces `compile(tenantId)` per tenant.
 * Exported for unit tests; production uses `startWorkspaceAtlasHubListener`.
 */
export function createWorkspaceAtlasHubRebuildScheduler(options: {
  debounceMs: number;
  compile: (tenantId: string) => Promise<void>;
}): (event: HubChangeEventPayload) => void {
  const debounceTimers = new Map<string, NodeJS.Timeout>();
  const { debounceMs, compile } = options;
  return (event: HubChangeEventPayload) => {
    const tenantId = event.tenantId;
    const prev = debounceTimers.get(tenantId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      debounceTimers.delete(tenantId);
      void compile(tenantId).catch((err) => {
        console.error("[workspace-atlas] debounced rebuild failed for tenant", tenantId, err);
      });
    }, debounceMs);
    debounceTimers.set(tenantId, t);
  };
}

/**
 * After hub backlog changes, rebuild the materialized atlas for that tenant (debounced).
 * Safe to call once at process startup.
 */
export function startWorkspaceAtlasHubListener(): void {
  subscribeAllHubChanges(
    createWorkspaceAtlasHubRebuildScheduler({
      debounceMs: env.WORKSPACE_ATLAS_DEBOUNCE_MS,
      compile: compileWorkspaceAtlasForTenant
    })
  );
  console.log(
    `[workspace-atlas] hub listener enabled (debounce ${env.WORKSPACE_ATLAS_DEBOUNCE_MS}ms, dataDir=${env.WORKSPACE_ATLAS_DATA_DIR ?? "(default)"})`
  );
}
