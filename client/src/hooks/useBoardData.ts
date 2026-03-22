import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Initiative, MetaPayload } from "../types/models";

export type BoardFilters = {
  domainId?: string;
  ownerId?: string;
  priority?: string;
  horizon?: string;
  labels?: string[];
  isGap?: boolean;
  archived?: boolean;
  quick?: string;
};

export function useBoardData(enabled = true) {
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [filters, setFilters] = useState<BoardFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.domainId) params.set("domainId", filters.domainId);
    if (filters.ownerId) params.set("ownerId", filters.ownerId);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.horizon) params.set("horizon", filters.horizon);
    if (filters.labels && filters.labels.length > 0) params.set("labels", filters.labels.join(","));
    if (typeof filters.isGap === "boolean") params.set("isGap", String(filters.isGap));
    if (filters.archived === true) params.set("archived", "true");
    return params;
  }, [filters]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
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
  }, [query, enabled]);

  useEffect(() => {
    if (enabled) refresh();
  }, [refresh, enabled]);

  const filteredInitiatives = useMemo(() => {
    const quick = filters.quick?.trim().toLowerCase();
    if (!quick) return initiatives;

    const wantsGap = quick.includes("gap");
    return initiatives.filter((initiative) => {
      if (wantsGap && !initiative.isGap) return false;
      const haystack = [
        initiative.title,
        initiative.description ?? "",
        initiative.notes ?? "",
        initiative.domain?.name ?? "",
        initiative.owner?.name ?? "",
        initiative.product?.name ?? "",
        ...initiative.features.flatMap((f) => [
          f.title,
          f.description ?? "",
          ...(f.labels ?? []),
          f.acceptanceCriteria ?? "",
          ...(f.requirements ?? []).flatMap((r) => [r.title, r.description ?? "", r.externalRef ?? "", ...(r.labels ?? [])])
        ])
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(quick);
    });
  }, [filters.quick, initiatives]);

  return {
    meta,
    initiatives: filteredInitiatives,
    filters,
    setFilters,
    setInitiatives,
    refresh,
    loading,
    error
  };
}
