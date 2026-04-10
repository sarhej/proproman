/** In-memory metrics for workspace atlas compiler and optional LLM calls. */
export const workspaceAtlasMetrics = {
  rebuildTotal: 0,
  rebuildErrors: 0,
  lastErrorMessage: null as string | null,
  lastRebuildAt: null as string | null,
  lastRebuildTenantId: null as string | null,
  llmCalls: 0,
  llmFailures: 0
};
