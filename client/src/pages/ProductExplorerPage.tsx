import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { BoardFilters } from "../hooks/useBoardData";
import type { Domain, Feature, Initiative, InitiativeStatus, ProductWithHierarchy, Requirement, User } from "../types/models";
import { ProductTree } from "../components/product-tree/ProductTree";
import { Label, Select } from "../components/ui/Field";

type Props = {
  isAdmin: boolean;
  /** EDITOR+ can create initiatives per API; structure edits stay isAdmin-only */
  canCreateInitiative: boolean;
  currentUserId: string | null;
  onOpenInitiative: (initiative: Initiative) => void;
  onRefreshBoard?: () => Promise<void>;
  quickFilter?: string;
  /** Same filters as the nav FiltersBar (pillar, owner, priority, horizon, archived, …) — applied to epics in the tree */
  boardFilters?: BoardFilters;
};

const STATUS_OPTIONS: InitiativeStatus[] = ["IDEA", "PLANNED", "IN_PROGRESS", "DONE", "BLOCKED"];

const TERMINOLOGY_KEY = "productTree.terminology";
type Terminology = "initiative" | "epic";

function getStoredTerminology(): Terminology {
  try {
    const v = localStorage.getItem(TERMINOLOGY_KEY);
    if (v === "epic" || v === "initiative") return v;
  } catch {
    /* ignore */
  }
  return "initiative";
}

function initiativeMatchesBoardFilters(i: Initiative, f: BoardFilters | undefined): boolean {
  if (!f) return true;
  if (f.domainId && i.domainId !== f.domainId) return false;
  if (f.ownerId && (i.ownerId ?? "") !== f.ownerId) return false;
  if (f.priority && i.priority !== f.priority) return false;
  if (f.horizon && i.horizon !== f.horizon) return false;
  if (typeof f.isGap === "boolean" && i.isGap !== f.isGap) return false;
  if (f.archived === true) {
    if (!i.archivedAt) return false;
  } else if (i.archivedAt) {
    return false;
  }
  return true;
}

function matchesAnyLabel(itemLabels: string[] | null | undefined, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const normalized = (itemLabels ?? []).map((label) => label.trim().toLowerCase());
  return selected.some((label) => normalized.includes(label));
}

export function ProductExplorerPage({
  isAdmin,
  canCreateInitiative,
  currentUserId,
  onOpenInitiative,
  onRefreshBoard,
  quickFilter,
  boardFilters
}: Props) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<ProductWithHierarchy[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [statusFilter, setStatusFilter] = useState<InitiativeStatus | "">("");
  const [impactFilter, setImpactFilter] = useState<"any" | "with">("any");
  const [terminology, setTerminology] = useState<Terminology>(getStoredTerminology);
  const [expandAllTick, setExpandAllTick] = useState(0);
  const [collapseAllTick, setCollapseAllTick] = useState(0);

  async function load() {
    const [prodResult, metaResult] = await Promise.all([api.getProducts(), api.getMeta()]);
    setProducts(prodResult.products);
    setUsers(metaResult.users);
    setDomains(metaResult.domains);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const onInitiativeUpdated = useCallback((updated: Initiative) => {
    setProducts((prev) =>
      prev.map((p) => {
        const idx = p.initiatives.findIndex((i) => i.id === updated.id);
        if (idx < 0) return p;
        const next = [...p.initiatives];
        next[idx] = updated;
        return { ...p, initiatives: next };
      })
    );
  }, []);

  const onFeatureUpdated = useCallback((updated: Feature) => {
    setProducts((prev) =>
      prev.map((p) => ({
        ...p,
        initiatives: p.initiatives.map((i) => {
          const idx = i.features?.findIndex((f) => f.id === updated.id) ?? -1;
          if (idx < 0) return i;
          const next = [...(i.features ?? [])];
          next[idx] = { ...updated, requirements: next[idx]?.requirements ?? updated.requirements ?? [] };
          return { ...i, features: next };
        })
      }))
    );
  }, []);

  const onRequirementUpdated = useCallback((updated: Requirement) => {
    setProducts((prev) =>
      prev.map((p) => ({
        ...p,
        initiatives: p.initiatives.map((i) => ({
          ...i,
          features: (i.features ?? []).map((f) => {
            const idx = f.requirements?.findIndex((r) => r.id === updated.id) ?? -1;
            if (idx < 0) return f;
            const next = [...(f.requirements ?? [])];
            next[idx] = updated;
            return { ...f, requirements: next };
          })
        }))
      }))
    );
  }, []);

  const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

  const filtered = useMemo(() => {
    const q = quickFilter?.trim().toLowerCase();
    const selectedLabels = (boardFilters?.labels ?? []).map((label) => label.trim().toLowerCase()).filter(Boolean);
    return products.map((product) => {
      let initiatives = product.initiatives.filter((initiative) => {
        if (!initiativeMatchesBoardFilters(initiative, boardFilters)) return false;
        if (statusFilter && initiative.status !== statusFilter) return false;
        if (impactFilter === "with") {
          const hasPersona = (initiative.personaImpacts?.length ?? 0) > 0;
          const hasRevenue = (initiative.revenueWeights?.length ?? 0) > 0;
          if (!hasPersona && !hasRevenue) return false;
        }
        return true;
      });

      if (selectedLabels.length > 0) {
        initiatives = initiatives
          .flatMap((initiative) => {
            const narrowedFeatures = (initiative.features ?? []).flatMap((feature) => {
                const featureMatched = matchesAnyLabel(feature.labels, selectedLabels);
                const matchedRequirements = (feature.requirements ?? []).filter((requirement) =>
                  matchesAnyLabel(requirement.labels, selectedLabels)
                );

                if (featureMatched) {
                  return [{
                    ...feature,
                    requirements: matchedRequirements.length > 0 ? matchedRequirements : feature.requirements ?? []
                  }];
                }
                if (matchedRequirements.length > 0) return [{ ...feature, requirements: matchedRequirements }];
                return [];
              });

            if (narrowedFeatures.length === 0) return [];
            return [{ ...initiative, features: narrowedFeatures }];
          })
          ;
      }

      if (q) {
        const requirementMatches = (r: Requirement) =>
          [r.title, r.description ?? "", r.externalRef ?? "", ...(r.labels ?? [])].join(" ").toLowerCase().includes(q);

        initiatives = initiatives
          .flatMap((initiative) => {
            // “Headline” match: keep the whole epic (all features & requirements) on purpose.
            const initHeadlineMatch = [
              initiative.title,
              initiative.owner?.name ?? "",
              initiative.domain?.name ?? "",
              product.name
            ]
              .join(" ")
              .toLowerCase()
              .includes(q);

            if (initHeadlineMatch) return [initiative];

            const initBodyMatch = [initiative.description ?? "", initiative.notes ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(q);

            const features = initiative.features ?? [];
            const narrowedFeatures = features.flatMap((f) => {
                const featSelf = [f.title, f.description ?? "", f.acceptanceCriteria ?? "", ...(f.labels ?? [])]
                  .join(" ")
                  .toLowerCase()
                  .includes(q);
                const allReqs = f.requirements ?? [];
                const matchedReqs = allReqs.filter(requirementMatches);

                if (featSelf) {
                  // Feature matched: show only requirements that also match when possible,
                  // so siblings without the term stay hidden. If the hit was only on feature
                  // fields, keep all requirements under that feature.
                  return [{ ...f, requirements: matchedReqs.length > 0 ? matchedReqs : allReqs }];
                }

                if (matchedReqs.length === 0) return [];
                return [{ ...f, requirements: matchedReqs }];
              });

            if (narrowedFeatures.length === 0) {
              if (initBodyMatch) return [initiative];
              return [];
            }
            return [{ ...initiative, features: narrowedFeatures }];
          })
          ;
      }

      initiatives.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99));
      return { ...product, initiatives };
    });
  }, [products, quickFilter, statusFilter, impactFilter, boardFilters]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <div>
          <Label>{t("common.status")}</Label>
          <Select value={statusFilter} onChange={(e) => setStatusFilter((e.target.value || "") as InitiativeStatus | "")}>
            <option value="">{t("filters.all")}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{t(`status.${s}`)}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("productTree.impact")}</Label>
          <Select value={impactFilter} onChange={(e) => setImpactFilter(e.target.value as "any" | "with")}>
            <option value="any">{t("filters.all")}</option>
            <option value="with">{t("productTree.withImpact")}</option>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label>{t("productTree.terminologyLabel")}</Label>
          <span className="inline-flex rounded border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              type="button"
              className={`rounded px-2 py-1 ${terminology === "initiative" ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              onClick={() => {
                setTerminology("initiative");
                try {
                  localStorage.setItem(TERMINOLOGY_KEY, "initiative");
                } catch {
                  /* ignore */
                }
              }}
            >
              {t("productTree.initiativeLabel")}
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 ${terminology === "epic" ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              onClick={() => {
                setTerminology("epic");
                try {
                  localStorage.setItem(TERMINOLOGY_KEY, "epic");
                } catch {
                  /* ignore */
                }
              }}
            >
              {t("productTree.epicLabel")}
            </button>
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 border-l border-slate-200 pl-3">
          <button
            type="button"
            className="text-xs font-medium text-sky-700 hover:underline"
            onClick={() => setExpandAllTick((n) => n + 1)}
          >
            {t("productTree.expandAll")}
          </button>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            className="text-xs font-medium text-sky-700 hover:underline"
            onClick={() => setCollapseAllTick((n) => n + 1)}
          >
            {t("productTree.collapseAll")}
          </button>
        </div>
      </div>
      <ProductTree
        products={filtered}
        expandAllSignal={expandAllTick}
        collapseAllSignal={collapseAllTick}
        quickFilter={quickFilter}
        terminology={terminology}
        users={users}
        domains={domains}
        isAdmin={isAdmin}
        canCreateInitiative={canCreateInitiative}
        currentUserId={currentUserId}
        onOpenInitiative={onOpenInitiative}
        onRefresh={async () => {
          await load();
          await onRefreshBoard?.();
        }}
        onInitiativeUpdated={onInitiativeUpdated}
        onFeatureUpdated={onFeatureUpdated}
        onRequirementUpdated={onRequirementUpdated}
        onAddProduct={async (name) => {
          await api.createProduct({ name, sortOrder: products.length + 1 });
          await load();
        }}
      />
    </div>
  );
}
