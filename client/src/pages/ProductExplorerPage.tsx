import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Domain, Initiative, ProductWithHierarchy, User } from "../types/models";
import { ProductTree } from "../components/product-tree/ProductTree";

type Props = {
  isAdmin: boolean;
  onOpenInitiative: (initiative: Initiative) => void;
  quickFilter?: string;
};

export function ProductExplorerPage({ isAdmin, onOpenInitiative, quickFilter }: Props) {
  const [products, setProducts] = useState<ProductWithHierarchy[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);

  async function load() {
    const [prodResult, metaResult] = await Promise.all([api.getProducts(), api.getMeta()]);
    setProducts(prodResult.products);
    setUsers(metaResult.users);
    setDomains(metaResult.domains);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const q = quickFilter?.trim().toLowerCase();
  const filtered = q
    ? products
        .map((product) => ({
          ...product,
          initiatives: product.initiatives.filter((initiative) => {
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
            return hay.includes(q);
          })
        }))
        .filter((p) => p.initiatives.length > 0)
    : products;

  return (
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
  );
}
