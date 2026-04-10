import { env } from "../env.js";
import { subscribeAllHubChanges } from "../services/hubChangeHub.js";
import { compileWorkspaceAtlasForTenant } from "./compiler.js";

const debounceTimers = new Map<string, NodeJS.Timeout>();

/**
 * After hub backlog changes, rebuild the materialized atlas for that tenant (debounced).
 * Safe to call once at process startup.
 */
export function startWorkspaceAtlasHubListener(): void {
  subscribeAllHubChanges((event) => {
    const tenantId = event.tenantId;
    const prev = debounceTimers.get(tenantId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      debounceTimers.delete(tenantId);
      void compileWorkspaceAtlasForTenant(tenantId).catch((err) => {
        console.error(`[workspace-atlas] debounced rebuild failed tenant=${tenantId}`, err);
      });
    }, env.WORKSPACE_ATLAS_DEBOUNCE_MS);
    debounceTimers.set(tenantId, t);
  });
  console.log(
    `[workspace-atlas] hub listener enabled (debounce ${env.WORKSPACE_ATLAS_DEBOUNCE_MS}ms, dataDir=${env.WORKSPACE_ATLAS_DATA_DIR ?? "(default)"})`
  );
}
