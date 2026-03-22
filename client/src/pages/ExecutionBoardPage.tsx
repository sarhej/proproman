import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay
} from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { ExecutionBoard, ProductWithHierarchy, Requirement } from "../types/models";
import { Card } from "../components/ui/Card";
import { Label, Select } from "../components/ui/Field";

const UNASSIGNED = "unassigned";

type CardItem = {
  requirement: Requirement;
  featureTitle: string;
  initiativeTitle: string;
};

function flattenRequirements(product: ProductWithHierarchy): CardItem[] {
  const out: CardItem[] = [];
  for (const init of product.initiatives) {
    for (const feat of init.features ?? []) {
      for (const req of feat.requirements ?? []) {
        out.push({
          requirement: req,
          featureTitle: feat.title,
          initiativeTitle: init.title
        });
      }
    }
  }
  return out;
}

function ReqCard({ item, isDragging }: { item: CardItem; isDragging?: boolean }) {
  const r = item.requirement;
  return (
    <Card
      className={`cursor-grab rounded border border-slate-200 p-2 text-left transition-shadow active:cursor-grabbing ${
        isDragging ? "opacity-50 shadow-md" : "hover:border-sky-300 hover:shadow"
      }`}
    >
      <Link to={`/requirements/${r.id}`} className="block">
        <p className="text-sm font-medium text-slate-900">{r.title}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{item.initiativeTitle}</p>
        <p className="text-[10px] text-slate-400">{item.featureTitle}</p>
        {r.status ? (
          <p className="mt-1 text-[10px] font-medium text-slate-600">PM: {r.status.replaceAll("_", " ")}</p>
        ) : null}
      </Link>
    </Card>
  );
}

function DraggableReqCard({ item, disabled }: { item: CardItem; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.requirement.id,
    disabled: !!disabled
  });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ReqCard item={item} isDragging={isDragging} />
    </div>
  );
}

function DroppableColumn({
  columnId,
  title,
  subtitle,
  count,
  children
}: {
  columnId: string;
  title: string;
  subtitle?: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${columnId}` });
  return (
    <Card
      className={`min-h-[160px] w-[200px] shrink-0 p-2 transition-colors ${
        isOver ? "ring-2 ring-sky-400 bg-sky-50/50" : ""
      }`}
    >
      <div ref={setNodeRef} className="min-h-[140px]">
        <div className="mb-2 flex flex-col gap-0.5 px-1">
          <div className="flex items-center justify-between gap-1">
            <p className="text-sm font-semibold text-slate-700">{title}</p>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{count}</span>
          </div>
          {subtitle ? <p className="text-[10px] text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="grid gap-2">{children}</div>
      </div>
    </Card>
  );
}

type Props = {
  onRefreshBoard?: () => Promise<void>;
  readOnly?: boolean;
};

export function ExecutionBoardPage({ onRefreshBoard, readOnly }: Props) {
  const { t } = useTranslation();
  const { productId } = useParams<{ productId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [product, setProduct] = useState<ProductWithHierarchy | null>(null);
  const [boards, setBoards] = useState<ExecutionBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initiativeFilter, setInitiativeFilter] = useState("");
  const [featureFilter, setFeatureFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const [{ products }, { boards: bds }] = await Promise.all([
        api.getProducts(),
        api.getExecutionBoards(productId)
      ]);
      setProduct(products.find((p) => p.id === productId) ?? null);
      setBoards(bds);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const boardIdParam = searchParams.get("boardId");
  const selectedBoard = useMemo(() => {
    if (!boards.length) return null;
    if (boardIdParam) {
      const found = boards.find((b) => b.id === boardIdParam);
      if (found) return found;
    }
    return boards.find((b) => b.isDefault) ?? boards[0] ?? null;
  }, [boards, boardIdParam]);

  const setBoardId = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("boardId", id);
    setSearchParams(next);
  };

  const allItems = useMemo(() => (product ? flattenRequirements(product) : []), [product]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (initiativeFilter && item.initiativeTitle !== initiativeFilter) return false;
      if (featureFilter && item.featureTitle !== featureFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !item.requirement.title.toLowerCase().includes(q) &&
          !item.featureTitle.toLowerCase().includes(q) &&
          !item.initiativeTitle.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [allItems, initiativeFilter, featureFilter, search]);

  const columns = useMemo(() => selectedBoard?.columns.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? [], [selectedBoard]);

  const itemsByColumn = useMemo(() => {
    const map = new Map<string, CardItem[]>();
    map.set(UNASSIGNED, []);
    for (const col of columns) {
      map.set(col.id, []);
    }
    for (const item of filteredItems) {
      const cid = item.requirement.executionColumnId;
      if (cid && map.has(cid)) {
        map.get(cid)!.push(item);
      } else {
        map.get(UNASSIGNED)!.push(item);
      }
    }
    return map;
  }, [filteredItems, columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (readOnly || !productId) return;
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith("column-")) return;
    const targetCol = overId.replace("column-", "");
    const reqId = String(active.id);
    const targetColumnId = targetCol === UNASSIGNED ? null : targetCol;
    try {
      const res = await api.updateRequirement(reqId, { executionColumnId: targetColumnId });
      setProduct((prev) => {
        if (!prev) return prev;
        const updated = res.requirement;
        return {
          ...prev,
          initiatives: prev.initiatives.map((i) => ({
            ...i,
            features: (i.features ?? []).map((f) => ({
              ...f,
              requirements: (f.requirements ?? []).map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
            }))
          }))
        };
      });
      await onRefreshBoard?.();
    } catch {
      await load();
    }
  }

  const activeItem = activeId ? filteredItems.find((i) => i.requirement.id === activeId) : null;

  const initiativeTitles = useMemo(() => {
    const s = new Set<string>();
    for (const i of product?.initiatives ?? []) s.add(i.title);
    return [...s].sort();
  }, [product]);

  const featureTitles = useMemo(() => {
    const s = new Set<string>();
    for (const i of product?.initiatives ?? []) {
      for (const f of i.features ?? []) s.add(f.title);
    }
    return [...s].sort();
  }, [product]);

  if (!productId) {
    return <p className="p-4 text-sm text-slate-500">{t("executionBoard.missingProduct")}</p>;
  }

  if (loading) {
    return <p className="p-4 text-sm text-slate-500">{t("common.loading")}</p>;
  }

  if (!product) {
    return (
      <div className="space-y-2 p-4">
        <p className="text-sm text-slate-600">{t("executionBoard.productNotFound")}</p>
        <Link to="/product-explorer" className="text-sm text-sky-600 hover:underline">
          {t("executionBoard.backToExplorer")}
        </Link>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd}>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{t("executionBoard.title")}</h1>
            <p className="text-sm text-slate-600">
              {product.itemType === "SYSTEM" ? t("topLevelItem.system") : t("topLevelItem.product")}: {product.name}
            </p>
            {selectedBoard ? (
              <p className="mt-1 text-xs text-slate-500">
                {t("executionBoard.boardLabel")}: {selectedBoard.name} · {selectedBoard.provider} · {selectedBoard.syncState}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/product-explorer"
              className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t("executionBoard.backToExplorer")}
            </Link>
            <Link
              to={`/products/${productId}/board-settings${selectedBoard ? `?boardId=${selectedBoard.id}` : ""}`}
              className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t("executionBoard.boardSettings")}
            </Link>
          </div>
        </div>

        {boards.length > 1 ? (
          <div className="max-w-xs">
            <Label>{t("executionBoard.selectBoard")}</Label>
            <Select value={selectedBoard?.id ?? ""} onChange={(e) => setBoardId(e.target.value)}>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.isDefault ? ` (${t("executionBoard.default")})` : ""}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {!selectedBoard ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>{t("executionBoard.noBoard")}</p>
            <Link to={`/products/${productId}/board-settings`} className="mt-2 inline-block text-sky-700 hover:underline">
              {t("executionBoard.createBoardHint")}
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <div>
                <Label>{t("executionBoard.filterInitiative")}</Label>
                <Select value={initiativeFilter} onChange={(e) => setInitiativeFilter(e.target.value)}>
                  <option value="">{t("filters.all")}</option>
                  {initiativeTitles.map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t("executionBoard.filterFeature")}</Label>
                <Select value={featureFilter} onChange={(e) => setFeatureFilter(e.target.value)}>
                  <option value="">{t("filters.all")}</option>
                  {featureTitles.map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[200px] flex-1">
                <Label>{t("common.search")}</Label>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2">
              <DroppableColumn
                columnId={UNASSIGNED}
                title={t("executionBoard.unassigned")}
                subtitle={t("executionBoard.unassignedHint")}
                count={itemsByColumn.get(UNASSIGNED)?.length ?? 0}
              >
                {(itemsByColumn.get(UNASSIGNED) ?? []).map((item) =>
                  readOnly ? (
                    <ReqCard key={item.requirement.id} item={item} />
                  ) : (
                    <DraggableReqCard key={item.requirement.id} item={item} disabled={false} />
                  )
                )}
              </DroppableColumn>
              {columns.map((col) => (
                <DroppableColumn
                  key={col.id}
                  columnId={col.id}
                  title={col.name}
                  subtitle={`PM ${col.mappedStatus.replaceAll("_", " ")}`}
                  count={itemsByColumn.get(col.id)?.length ?? 0}
                >
                  {(itemsByColumn.get(col.id) ?? []).map((item) =>
                    readOnly ? (
                      <ReqCard key={item.requirement.id} item={item} />
                    ) : (
                      <DraggableReqCard key={item.requirement.id} item={item} disabled={false} />
                    )
                  )}
                </DroppableColumn>
              ))}
            </div>
          </>
        )}
      </div>
      <DragOverlay>
        {activeItem ? (
          <div className="rotate-1 opacity-95">
            <ReqCard item={activeItem} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
