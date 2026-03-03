import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Initiative, ProductWithHierarchy, User } from "../types/models";
import { ProductTree } from "../components/product-tree/ProductTree";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Field";

type Props = {
  isAdmin: boolean;
  onOpenInitiative: (initiative: Initiative) => void;
};

export function ProductExplorerPage({ isAdmin, onOpenInitiative }: Props) {
  const [products, setProducts] = useState<ProductWithHierarchy[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newProductName, setNewProductName] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    const [prodResult, metaResult] = await Promise.all([api.getProducts(), api.getMeta()]);
    setProducts(prodResult.products);
    setUsers(metaResult.users);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const filtered = search.trim()
    ? products
        .map((product) => ({
          ...product,
          initiatives: product.initiatives.filter((initiative) => {
            const hay = [
              initiative.title,
              initiative.description ?? "",
              initiative.owner?.name ?? "",
              initiative.domain?.name ?? "",
              ...initiative.features.map((f) => f.title)
            ]
              .join(" ")
              .toLowerCase();
            return hay.includes(search.trim().toLowerCase());
          })
        }))
        .filter((p) => p.initiatives.length > 0)
    : products;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search initiatives, features, owners..."
          />
        </div>
        {isAdmin ? (
          <div className="flex gap-2">
            <Input
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              placeholder="New product name"
            />
            <Button
              onClick={async () => {
                if (!newProductName.trim()) return;
                await api.createProduct({ name: newProductName, sortOrder: products.length + 1 });
                setNewProductName("");
                await load();
              }}
            >
              Add product
            </Button>
          </div>
        ) : null}
      </div>
      <ProductTree
        products={filtered}
        users={users}
        isAdmin={isAdmin}
        onOpenInitiative={onOpenInitiative}
        onRefresh={load}
      />
    </div>
  );
}
