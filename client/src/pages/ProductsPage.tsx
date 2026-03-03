import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Product } from "../types/models";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Field";

type Props = {
  isAdmin: boolean;
};

export function ProductsPage({ isAdmin }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");

  async function load() {
    const result = await api.getProducts();
    setProducts(result.products);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-lg font-semibold">Products / Assets</h2>
      {isAdmin ? (
        <div className="mb-3 flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New product / asset name" />
          <Button
            onClick={async () => {
              if (!name.trim()) return;
              await api.createProduct({ name, sortOrder: products.length + 1 });
              setName("");
              await load();
            }}
          >
            Add
          </Button>
        </div>
      ) : null}
      <div className="grid gap-2">
        {products.map((p) => (
          <div key={p.id} className="rounded border border-slate-200 px-3 py-2 text-sm">
            <div className="font-medium">{p.name}</div>
            <div className="text-slate-500">{p.description || "No description"}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
