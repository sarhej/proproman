import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { api } from "../lib/api";
import type { Product } from "../types/models";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Textarea } from "../components/ui/Field";

type Props = {
  isAdmin: boolean;
};

export function ProductsPage({ isAdmin }: Props) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  async function load() {
    const result = await api.getProducts();
    setProducts(result.products);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  function startEdit(p: Product) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditDescription(p.description ?? "");
  }

  async function saveEdit() {
    if (!editingId) return;
    await api.updateProduct(editingId, { name: editName.trim(), description: editDescription.trim() || null });
    setEditingId(null);
    await load();
  }

  function cancelEdit() {
    setEditingId(null);
  }

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
            {editingId === p.id ? (
              <div className="space-y-2">
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t("products.namePlaceholder")} />
                <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder={t("products.descriptionPlaceholder")} rows={2} />
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={cancelEdit}>{t("common.cancel")}</Button>
                  <Button onClick={saveEdit}>{t("common.save")}</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{p.name}</div>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      title={t("common.edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="text-slate-500">{p.description || "No description"}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
