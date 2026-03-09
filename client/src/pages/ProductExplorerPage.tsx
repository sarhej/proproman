import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { Domain, Initiative, InitiativeStatus, ProductWithHierarchy, User } from "../types/models";
import { ProductTree } from "../components/product-tree/ProductTree";
import { Label, Select } from "../components/ui/Field";

type Props = {
  isAdmin: boolean;
  onOpenInitiative: (initiative: Initiative) => void;
  quickFilter?: string;
};

const STATUS_OPTIONS: InitiativeStatus[] = ["IDEA", "PLANNED", "IN_PROGRESS", "DONE", "BLOCKED"];

export function ProductExplorerPage({ isAdmin, onOpenInitiative, quickFilter }: Props) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<ProductWithHierarchy[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [statusFilter, setStatusFilter] = useState<InitiativeStatus | "">("");
  const [impactFilter, setImpactFilter] = useState<"any" | "with">("any");

  async function load() {
    const [prodResult, metaResult] = await Promise.all([api.getProducts(), api.getMeta()]);
    setProducts(prodResult.products);
    setUsers(metaResult.users);
    setDomains(metaResult.domains);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = quickFilter?.trim().toLowerCase();
    return products
      .map((product) => ({
        ...product,
        initiatives: product.initiatives.filter((initiative) => {
          if (statusFilter && initiative.status !== statusFilter) return false;
          if (impactFilter === "with") {
            const hasPersona = (initiative.personaImpacts?.length ?? 0) > 0;
            const hasRevenue = (initiative.revenueWeights?.length ?? 0) > 0;
            if (!hasPersona && !hasRevenue) return false;
          }
          if (q) {
            const hay = [
              initiative.title,
              initiative.description ?? "",
              initiative.owner?.name ?? "",
              initiative.domain?.name ?? "",
              product.name,
              ...initiative.features.map((f) => f.title)
            ]
              .join(" ")
              .toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        })
      }))
      .filter((p) => p.initiatives.length > 0);
  }, [products, quickFilter, statusFilter, impactFilter]);

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
      </div>
      <ProductTree
      products={filtered}
      users={users}
      domains={domains}
      isAdmin={isAdmin}
      onOpenInitiative={onOpenInitiative}
      onRefresh={load}
      onAddProduct={async (name) => {
        await api.createProduct({ name, sortOrder: products.length + 1 });
        await load();
      }}
    />
    </div>
  );
}
