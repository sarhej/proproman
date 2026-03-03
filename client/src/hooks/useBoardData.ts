import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Initiative, MetaPayload } from "../types/models";

type Filters = {
  domainId?: string;
  ownerId?: string;
  priority?: string;
  horizon?: string;
  isGap?: boolean;
};

export function useBoardData() {
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.domainId) params.set("domainId", filters.domainId);
    if (filters.ownerId) params.set("ownerId", filters.ownerId);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.horizon) params.set("horizon", filters.horizon);
    if (typeof filters.isGap === "boolean") params.set("isGap", String(filters.isGap));
    return params;
  }, [filters]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [metaPayload, initiativesPayload] = await Promise.all([
        api.getMeta(),
        api.getInitiatives(query)
      ]);
      setMeta(metaPayload);
      setInitiatives(initiativesPayload.initiatives);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    meta,
    initiatives,
    filters,
    setFilters,
    setInitiatives,
    refresh,
    loading,
    error
  };
}
