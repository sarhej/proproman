import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

/**
 * @param workspaceKey When the active workspace changes (or tab-local X-Tenant-Id target), refetch
 *   merged nav visibility so multi-tab / switcher stays correct.
 */
export function useUiSettings(enabled: boolean, workspaceKey?: string | null) {
  const [hiddenNavPaths, setHiddenNavPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setHiddenNavPaths(new Set());
      return;
    }
    setError(null);
    try {
      const { hiddenNavPaths: list } = await api.getUiSettings();
      setHiddenNavPaths(new Set(list));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setHiddenNavPaths(new Set());
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setHiddenNavPaths(new Set());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, workspaceKey, refresh]);

  return { hiddenNavPaths, loading, error, refresh };
}
