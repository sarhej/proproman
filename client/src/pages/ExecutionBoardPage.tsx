import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type DraggableSyntheticListeners,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  KanbanBoardLayout,
  useKanbanLayout,
  useKanbanColumnClassName,
  useMobileKanbanSnap
} from "../components/boards/KanbanBoardLayout";
import { useWorkspaceLinkBuilder } from "../hooks/useWorkspaceHref";
import { api } from "../lib/api";
import type {
  ExecutionBoard,
  ExecutionColumn,
  ProductWithHierarchy,
  Requirement,
  TaskStatus
} from "../types/models";
import { Card } from "../components/ui/Card";
import { Label, Select } from "../components/ui/Field";

const UNASSIGNED = "unassigned";
const PM_STATUSES: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "TESTING", "DONE"];

type CardItem = {
  requirement: Requirement;
  featureId: string;
  featureTitle: string;
  initiativeId: string;
  initiativeTitle: string;
};

function flattenRequirements(product: ProductWithHierarchy): CardItem[] {
  const out: CardItem[] = [];
  for (const init of product.initiatives) {
    for (const feat of init.features ?? []) {
      for (const req of feat.requirements ?? []) {
        out.push({
          requirement: req,
          featureId: feat.id,
          featureTitle: feat.title,
          initiativeId: init.id,
          initiativeTitle: init.title
        });
      }
    }
  }
  return out;
}

/** True when PM state is "done" even if executionColumnId was never set (e.g. checkbox in Product Explorer). */
function requirementDoneForBoard(r: Requirement): boolean {
  return r.isDone === true || r.status === "DONE";
}

function effectivePmStatus(r: Requirement): TaskStatus {
  if (requirementDoneForBoard(r)) return "DONE";
  return r.status ?? "NOT_STARTED";
}

/** First column on this board mapped to a PM status (by sortOrder), if any. */
function columnIdForMappedStatus(boardColumns: ExecutionColumn[], status: string): string | null {
  const ordered = boardColumns.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const col = ordered.find((c) => c.mappedStatus === status);
  return col?.id ?? null;
}

/**
 * When executionColumnId is unset, place active PM statuses on the matching board column.
 * NOT_STARTED stays in Unassigned until explicitly placed on the board.
 */
function columnIdForStatusFallback(boardColumns: ExecutionColumn[], r: Requirement): string | null {
  if (requirementDoneForBoard(r)) {
    return columnIdForMappedStatus(boardColumns, "DONE");
  }
  const status = r.status ?? "NOT_STARTED";
  if (status === "NOT_STARTED") return null;
  return columnIdForMappedStatus(boardColumns, status);
}

/** Column keys: UNASSIGNED + each execution column id for the selected board. */
function buildColumnItemIds(
  product: ProductWithHierarchy,
  boardColumns: ExecutionColumn[]
): Record<string, string[]> {
  const items = flattenRequirements(product);
  const byId = new Map(items.map((x) => [x.requirement.id, x.requirement]));
  const map: Record<string, string[]> = { [UNASSIGNED]: [] };
  for (const c of boardColumns) map[c.id] = [];
  for (const item of items) {
    const r = item.requirement;
    const cid = r.executionColumnId;
    let key: string;
    if (cid && map[cid] !== undefined) {
      key = cid;
    } else {
      const fallbackColId = columnIdForStatusFallback(boardColumns, r);
      key = fallbackColId && map[fallbackColId] !== undefined ? fallbackColId : UNASSIGNED;
    }
    map[key].push(r.id);
  }
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => {
      const ra = byId.get(a)!;
      const rb = byId.get(b)!;
      const eso = (ra.executionSortOrder ?? 0) - (rb.executionSortOrder ?? 0);
      if (eso !== 0) return eso;
      return a.localeCompare(b);
    });
  }
  return map;
}

function findColumnKeyForDragId(id: string, columnItemIds: Record<string, string[]>): string | null {
  if (id.startsWith("column-")) return id.slice("column-".length);
  for (const [key, ids] of Object.entries(columnItemIds)) {
    if (ids.includes(id)) return key;
  }
  return null;
}

function itemMatchesFilters(
  item: CardItem,
  filters: {
    search: string;
    initiativeId: string;
    featureId: string;
    pmStatus: string;
  }
): boolean {
  if (filters.initiativeId && item.initiativeId !== filters.initiativeId) return false;
  if (filters.featureId && item.featureId !== filters.featureId) return false;
  if (filters.pmStatus && effectivePmStatus(item.requirement) !== filters.pmStatus) return false;
  const q = filters.search.trim().toLowerCase();
  if (q) {
    const hay = [
      item.requirement.title,
      item.featureTitle,
      item.initiativeTitle
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function findColumnKeyForReqId(id: string, columnItemIds: Record<string, string[]>): string | null {
  for (const [key, ids] of Object.entries(columnItemIds)) {
    if (ids.includes(id)) return key;
  }
  return null;
}

function ReqCard({
  item,
  isDragging,
  isDragOverlay,
  requirementLink,
  dragHandleProps,
  cardDragProps,
  onLinkClick
}: {
  item: CardItem;
  isDragging?: boolean;
  isDragOverlay?: boolean;
  requirementLink: (id: string) => string;
  dragHandleProps?: DraggableSyntheticListeners;
  cardDragProps?: DraggableSyntheticListeners;
  onLinkClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { t } = useTranslation();
  const r = item.requirement;
  return (
    <Card
      className={`w-full min-w-0 max-w-full overflow-hidden rounded border border-slate-200 p-2 text-left transition-shadow ${
        isDragging ? "opacity-50 shadow-md" : "hover:border-sky-300 hover:shadow"
      } ${isDragOverlay ? "kanban-drag-overlay-card shadow-xl" : ""} ${cardDragProps ? "kanban-card-draggable" : ""}`}
      {...(cardDragProps ?? {})}
    >
      <div className="flex min-w-0 items-start gap-1">
        {dragHandleProps ? (
          <button
            type="button"
            className="kanban-drag-handle mt-0.5 hidden shrink-0 cursor-grab rounded p-0.5 text-slate-400 hover:bg-slate-100 active:cursor-grabbing lg:inline-flex"
            aria-label={t("executionBoard.dragCard")}
            {...dragHandleProps}
          >
            <GripVertical size={14} aria-hidden />
          </button>
        ) : null}
        <Link
          to={requirementLink(r.id)}
          className="block min-w-0 flex-1 overflow-hidden"
          onClick={onLinkClick}
          draggable={false}
        >
          <p className="line-clamp-3 break-words text-sm font-medium text-slate-900">{r.title}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{item.initiativeTitle}</p>
          <p className="truncate text-[10px] text-slate-400" title={item.featureTitle}>
            {item.featureTitle}
          </p>
          {r.status ? (
            <p className="mt-1 text-[10px] font-medium text-slate-600">PM: {r.status.replaceAll("_", " ")}</p>
          ) : null}
        </Link>
      </div>
    </Card>
  );
}

function SortableReqCard({
  item,
  disabled,
  requirementLink
}: {
  item: CardItem;
  disabled?: boolean;
  requirementLink: (id: string) => string;
}) {
  const { mobileSnap } = useKanbanLayout();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.requirement.id,
    disabled: !!disabled
  });
  const didDragRef = useRef(false);
  useEffect(() => {
    if (isDragging) didDragRef.current = true;
  }, [isDragging]);

  const handleLinkClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (didDragRef.current) {
      e.preventDefault();
      didDragRef.current = false;
    }
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div ref={setNodeRef} style={style} className="w-full min-w-0 max-w-full" {...attributes}>
      <ReqCard
        item={item}
        isDragging={isDragging}
        requirementLink={requirementLink}
        dragHandleProps={disabled || mobileSnap ? undefined : listeners}
        cardDragProps={disabled || !mobileSnap ? undefined : listeners}
        onLinkClick={handleLinkClick}
      />
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
  children: ReactNode;
}) {
  const columnClassName = useKanbanColumnClassName();
  const { setNodeRef, isOver } = useDroppable({ id: `column-${columnId}` });
  return (
    <Card
      className={`min-h-[160px] w-full min-w-0 max-w-full p-2 transition-colors ${columnClassName} ${
        isOver ? "ring-2 ring-sky-400 bg-sky-50/50" : ""
      }`}
    >
      <div ref={setNodeRef} className="min-h-[140px] min-w-0">
        <div className="mb-2 flex min-w-0 flex-col gap-0.5 px-1">
          <div className="flex min-w-0 items-center justify-between gap-1">
            <p className="min-w-0 truncate text-sm font-semibold text-slate-700">{title}</p>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{count}</span>
          </div>
          {subtitle ? <p className="text-[10px] text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="grid min-w-0 gap-2">{children}</div>
      </div>
    </Card>
  );
}

type Props = {
  /** Sync initiatives/meta without toggling global loading */
  onRefreshBoardSilent?: () => void;
  readOnly?: boolean;
};

export function ExecutionBoardPage({ onRefreshBoardSilent, readOnly }: Props) {
  const { t } = useTranslation();
  const { productId } = useParams<{ productId: string }>();
  const w = useWorkspaceLinkBuilder();
  const [searchParams, setSearchParams] = useSearchParams();
  const [product, setProduct] = useState<ProductWithHierarchy | null>(null);
  const [boards, setBoards] = useState<ExecutionBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const [columnItemIds, setColumnItemIds] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragPointerX, setDragPointerX] = useState<number | null>(null);
  const mobileSnap = useMobileKanbanSnap();
  const [search, setSearch] = useState("");
  const [initiativeFilter, setInitiativeFilter] = useState("");
  const [featureFilter, setFeatureFilter] = useState("");
  const [pmStatusFilter, setPmStatusFilter] = useState("");

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!productId) return;
      if (!opts?.silent) setLoading(true);
      try {
        const [{ products }, { boards: bds }] = await Promise.all([
          api.getProducts(),
          api.getExecutionBoards(productId)
        ]);
        setProduct(products.find((p) => p.id === productId) ?? null);
        setBoards(bds);
        setLayoutEpoch((e) => e + 1);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [productId]
  );

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

  const columns = useMemo(
    () => selectedBoard?.columns.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? [],
    [selectedBoard]
  );

  const columnSnapLabels = useMemo(
    () => [t("executionBoard.unassigned"), ...columns.map((c) => c.name)],
    [columns, t]
  );

  useEffect(() => {
    if (!product || !columns.length) {
      setColumnItemIds({});
      return;
    }
    setColumnItemIds(buildColumnItemIds(product, columns));
  }, [layoutEpoch, product, columns]);

  const allItems = useMemo(() => (product ? flattenRequirements(product) : []), [product]);
  const itemByReqId = useMemo(() => new Map(allItems.map((i) => [i.requirement.id, i])), [allItems]);

  const filtersActive = Boolean(
    search.trim() || initiativeFilter || featureFilter || pmStatusFilter
  );

  const filteredItemIds = useMemo(() => {
    const filters = {
      search,
      initiativeId: initiativeFilter,
      featureId: featureFilter,
      pmStatus: pmStatusFilter
    };
    const ids = new Set<string>();
    for (const item of allItems) {
      if (itemMatchesFilters(item, filters)) ids.add(item.requirement.id);
    }
    return ids;
  }, [allItems, search, initiativeFilter, featureFilter, pmStatusFilter]);

  const initiativeOptions = useMemo(() => {
    if (!product) return [];
    return product.initiatives.map((i) => ({ id: i.id, title: i.title }));
  }, [product]);

  const featureOptions = useMemo(() => {
    if (!product) return [];
    const out: { id: string; title: string }[] = [];
    for (const init of product.initiatives) {
      if (initiativeFilter && init.id !== initiativeFilter) continue;
      for (const feat of init.features ?? []) {
        out.push({ id: feat.id, title: feat.title });
      }
    }
    return out;
  }, [product, initiativeFilter]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 450, tolerance: 8 } })
  );

  function pointerXFromDragEvent(event: DragStartEvent | DragMoveEvent): number | null {
    const activator = event.activatorEvent;
    if (activator instanceof MouseEvent) {
      return activator.clientX + event.delta.x;
    }
    if (activator instanceof TouchEvent) {
      const touch = activator.touches[0] ?? activator.changedTouches[0];
      if (touch) return touch.clientX + event.delta.x;
    }
    if ("clientX" in activator && typeof activator.clientX === "number") {
      return activator.clientX + event.delta.x;
    }
    return null;
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setDragActive(true);
    setDragPointerX(pointerXFromDragEvent(event));
  }

  function onDragMove(event: DragMoveEvent) {
    setDragPointerX(pointerXFromDragEvent(event));
  }

  function onDragEndOrCancel() {
    setActiveId(null);
    setDragActive(false);
    setDragPointerX(null);
  }

  async function persistLayout(map: Record<string, string[]>) {
    if (!productId) return;
    const body = {
      productId,
      columns: [
        { executionColumnId: null as string | null, requirementIds: map[UNASSIGNED] ?? [] },
        ...columns.map((c) => ({ executionColumnId: c.id, requirementIds: map[c.id] ?? [] }))
      ]
    };
    try {
      await api.saveExecutionBoardLayout(body);
      await load({ silent: true });
      onRefreshBoardSilent?.();
    } catch {
      await load({ silent: true });
    }
  }

  /** Programmatic column move — kept for optional mobile/accessibility fallback UI. */
  async function moveCardToColumn(reqId: string, targetColumnKey: string) {
    if (readOnly || !productId || filtersActive) return;
    const activeContainer = findColumnKeyForReqId(reqId, columnItemIds);
    if (!activeContainer || activeContainer === targetColumnKey) return;
    const from = [...(columnItemIds[activeContainer] ?? [])];
    const to = [...(columnItemIds[targetColumnKey] ?? [])];
    const fromIdx = from.indexOf(reqId);
    if (fromIdx < 0) return;
    const [removed] = from.splice(fromIdx, 1);
    to.push(removed);
    const nextMap = { ...columnItemIds, [activeContainer]: from, [targetColumnKey]: to };
    setColumnItemIds(nextMap);
    await persistLayout(nextMap);
  }

  async function onDragEnd(event: DragEndEvent) {
    onDragEndOrCancel();
    if (readOnly || !productId || filtersActive) return;
    const { active, over } = event;
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const activeContainer = findColumnKeyForDragId(activeIdStr, columnItemIds);
    let overContainer = findColumnKeyForDragId(overIdStr, columnItemIds);
    if (!overContainer && overIdStr.startsWith("column-")) {
      overContainer = overIdStr.slice("column-".length);
    }
    if (!activeContainer || !overContainer) return;

    let nextMap = { ...columnItemIds };

    if (activeContainer === overContainer) {
      const items = [...(nextMap[activeContainer] ?? [])];
      const oldIndex = items.indexOf(activeIdStr);
      const newIndex = items.indexOf(overIdStr);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      nextMap = { ...nextMap, [overContainer]: arrayMove(items, oldIndex, newIndex) };
    } else {
      const from = [...(nextMap[activeContainer] ?? [])];
      const to = [...(nextMap[overContainer] ?? [])];
      const fromIdx = from.indexOf(activeIdStr);
      if (fromIdx < 0) return;
      const [removed] = from.splice(fromIdx, 1);
      let insertAt: number;
      if (overIdStr.startsWith("column-")) {
        insertAt = to.length;
      } else {
        insertAt = to.indexOf(overIdStr);
        if (insertAt < 0) insertAt = to.length;
      }
      to.splice(insertAt, 0, removed);
      nextMap = { ...nextMap, [activeContainer]: from, [overContainer]: to };
    }

    setColumnItemIds(nextMap);
    await persistLayout(nextMap);
  }

  const activeItem = activeId ? itemByReqId.get(activeId) ?? null : null;
  const requirementLink = (id: string) => w(`/requirements/${id}`);
  const dndDisabled = readOnly || filtersActive;
  const kanbanColumnCount = selectedBoard ? columns.length + 1 : 0;

  function renderBoardCard(item: CardItem) {
    if (dndDisabled) {
      return <ReqCard key={item.requirement.id} item={item} requirementLink={requirementLink} />;
    }
    return (
      <SortableReqCard
        key={item.requirement.id}
        item={item}
        disabled={false}
        requirementLink={requirementLink}
      />
    );
  }

  function visibleIdsForColumn(key: string): string[] {
    return (columnItemIds[key] ?? []).filter((id) => filteredItemIds.has(id));
  }

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
        <Link to={w("/product-explorer")} className="text-sm text-sky-600 hover:underline">
          {t("executionBoard.backToExplorer")}
        </Link>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragEndOrCancel}
    >
      <div className="space-y-3 px-2 py-3 lg:px-3 lg:py-4">
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
              to={w("/product-explorer")}
              className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t("executionBoard.backToExplorer")}
            </Link>
            <Link
              to={w(
                `/products/${productId}/board-settings${selectedBoard ? `?boardId=${selectedBoard.id}` : ""}`
              )}
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

        {selectedBoard ? (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex-1 min-w-[160px]">
              <Label>{t("executionBoard.filterSearch")}</Label>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("executionBoard.filterSearchPlaceholder")}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <Label>{t("executionBoard.filterInitiative")}</Label>
              <Select
                value={initiativeFilter}
                onChange={(e) => {
                  setInitiativeFilter(e.target.value);
                  setFeatureFilter("");
                }}
              >
                <option value="">{t("filters.all")}</option>
                {initiativeOptions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t("executionBoard.filterFeature")}</Label>
              <Select value={featureFilter} onChange={(e) => setFeatureFilter(e.target.value)}>
                <option value="">{t("filters.all")}</option>
                {featureOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t("executionBoard.filterPmStatus")}</Label>
              <Select value={pmStatusFilter} onChange={(e) => setPmStatusFilter(e.target.value)}>
                <option value="">{t("filters.all")}</option>
                {PM_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`common.taskStatus.${status}`)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : null}

        {filtersActive ? (
          <p className="text-xs text-slate-500">{t("executionBoard.clearFiltersToReorder")}</p>
        ) : null}

        {!selectedBoard ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>{t("executionBoard.noBoard")}</p>
            <Link to={w(`/products/${productId}/board-settings`)} className="mt-2 inline-block text-sky-700 hover:underline">
              {t("executionBoard.createBoardHint")}
            </Link>
          </div>
        ) : (
          <KanbanBoardLayout
            columnCount={kanbanColumnCount}
            columnSnapLabels={columnSnapLabels}
            dragActive={dragActive}
            dragPointerX={dragPointerX}
          >
            <DroppableColumn
              columnId={UNASSIGNED}
              title={t("executionBoard.unassigned")}
              subtitle={t("executionBoard.unassignedHint")}
              count={visibleIdsForColumn(UNASSIGNED).length}
            >
              <SortableContext
                items={visibleIdsForColumn(UNASSIGNED)}
                strategy={verticalListSortingStrategy}
              >
                {visibleIdsForColumn(UNASSIGNED).map((rid) => {
                  const item = itemByReqId.get(rid);
                  if (!item) return null;
                  return renderBoardCard(item);
                })}
              </SortableContext>
            </DroppableColumn>
            {columns.map((col) => (
              <DroppableColumn
                key={col.id}
                columnId={col.id}
                title={col.name}
                subtitle={`PM ${col.mappedStatus.replaceAll("_", " ")}`}
                count={visibleIdsForColumn(col.id).length}
              >
                <SortableContext
                  items={visibleIdsForColumn(col.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {visibleIdsForColumn(col.id).map((rid) => {
                    const item = itemByReqId.get(rid);
                    if (!item) return null;
                    return renderBoardCard(item);
                  })}
                </SortableContext>
              </DroppableColumn>
            ))}
          </KanbanBoardLayout>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className={mobileSnap ? "kanban-drag-overlay-mobile rotate-2" : "rotate-1 opacity-95"}>
            <ReqCard item={activeItem} isDragOverlay requirementLink={requirementLink} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
