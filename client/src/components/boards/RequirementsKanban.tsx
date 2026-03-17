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
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Initiative, Requirement } from "../../types/models";
import { formatPriority } from "../../lib/format";
import { Card } from "../ui/Card";
import { Label, Select } from "../ui/Field";

type FlatRequirement = {
  requirement: Requirement;
  featureId: string;
  featureTitle: string;
  initiativeId: string;
  initiativeTitle: string;
  productName: string;
};

const COL_OPEN = "open";
const COL_DONE = "done";

function requirementIsDone(r: Requirement): boolean {
  return r.isDone || r.status === "DONE";
}

type Props = {
  initiatives: Initiative[];
  onMoveRequirement: (requirementId: string, isDone: boolean) => Promise<void>;
};

function RequirementCard({ item, isDragging }: { item: FlatRequirement; isDragging?: boolean }) {
  const done = requirementIsDone(item.requirement);
  return (
    <Card
      className={`cursor-grab rounded border border-slate-200 p-2 text-left transition-shadow active:cursor-grabbing ${
        isDragging ? "opacity-50 shadow-md" : "hover:border-sky-300 hover:shadow"
      }`}
    >
      <Link to={`/requirements/${item.requirement.id}`} className="block">
        <p className="text-sm font-medium text-slate-900">{item.requirement.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{item.initiativeTitle}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            {formatPriority(item.requirement.priority)}
          </span>
          {done ? (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
              Done
            </span>
          ) : (
            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
              Open
            </span>
          )}
        </div>
      </Link>
    </Card>
  );
}

function DraggableRequirementCard({ item }: { item: FlatRequirement }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.requirement.id
  });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <RequirementCard item={item} isDragging={isDragging} />
    </div>
  );
}

function DroppableColumn({
  columnId,
  title,
  count,
  children
}: {
  columnId: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${columnId}` });
  return (
    <Card
      className={`min-h-[140px] flex-1 p-2 transition-colors ${
        isOver ? "ring-2 ring-sky-400 bg-sky-50/50" : ""
      }`}
    >
      <div ref={setNodeRef} className="min-h-[120px]">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{count}</span>
        </div>
        <div className="grid gap-2">{children}</div>
      </div>
    </Card>
  );
}

export function RequirementsKanban({ initiatives, onMoveRequirement }: Props) {
  const { t } = useTranslation();
  const [productFilter, setProductFilter] = useState<string>("");
  const [initiativeFilter, setInitiativeFilter] = useState<string>("");
  const [featureFilter, setFeatureFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const flatRequirements = useMemo((): FlatRequirement[] => {
    const out: FlatRequirement[] = [];
    for (const init of initiatives) {
      if (productFilter && init.productId !== productFilter) continue;
      if (initiativeFilter && init.id !== initiativeFilter) continue;
      for (const feat of init.features ?? []) {
        if (featureFilter && feat.id !== featureFilter) continue;
        for (const req of feat.requirements ?? []) {
          if (search.trim()) {
            const q = search.trim().toLowerCase();
            if (
              !req.title.toLowerCase().includes(q) &&
              !feat.title.toLowerCase().includes(q) &&
              !init.title.toLowerCase().includes(q)
            ) {
              continue;
            }
          }
          out.push({
            requirement: req,
            featureId: feat.id,
            featureTitle: feat.title,
            initiativeId: init.id,
            initiativeTitle: init.title,
            productName: init.product?.name ?? "—"
          });
        }
      }
    }
    return out;
  }, [initiatives, productFilter, initiativeFilter, featureFilter, search]);

  const byFeature = useMemo(() => {
    const map = new Map<string, FlatRequirement[]>();
    for (const item of flatRequirements) {
      const list = map.get(item.featureId) ?? [];
      list.push(item);
      map.set(item.featureId, list);
    }
    return Array.from(map.entries()).map(([featureId, items]) => {
      const first = items[0];
      return {
        featureId,
        featureTitle: first.featureTitle,
        initiativeTitle: first.initiativeTitle,
        productName: first.productName,
        items
      };
    });
  }, [flatRequirements]);

  const openItems = useMemo(
    () => flatRequirements.filter((i) => !requirementIsDone(i.requirement)),
    [flatRequirements]
  );
  const doneItems = useMemo(
    () => flatRequirements.filter((i) => requirementIsDone(i.requirement)),
    [flatRequirements]
  );

  const products = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const init of initiatives) {
      if (init.product && !seen.has(init.product.id)) {
        seen.add(init.product.id);
        list.push({ id: init.product.id, name: init.product.name });
      }
    }
    return list;
  }, [initiatives]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith("column-")) return;
    const targetCol = overId.replace("column-", "");
    const item = flatRequirements.find((i) => i.requirement.id === active.id);
    if (!item) return;
    const currentlyDone = requirementIsDone(item.requirement);
    const targetDone = targetCol === COL_DONE;
    if (currentlyDone !== targetDone) {
      await onMoveRequirement(item.requirement.id, targetDone);
    }
  }

  const activeItem = activeId ? flatRequirements.find((i) => i.requirement.id === activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-4 p-4">
        <h1 className="text-xl font-semibold text-slate-900">{t("nav.requirementsKanban")}</h1>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <div>
            <Label>{`${t("filters.all")} product`}</Label>
            <Select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
              <option value="">{t("filters.all")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Initiative</Label>
            <Select value={initiativeFilter} onChange={(e) => setInitiativeFilter(e.target.value)}>
              <option value="">{t("filters.all")}</option>
              {initiatives.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Feature</Label>
            <Select value={featureFilter} onChange={(e) => setFeatureFilter(e.target.value)}>
              <option value="">{t("filters.all")}</option>
              {initiatives.flatMap((i) => (i.features ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              )))}
            </Select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label>Search</Label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, feature, initiative..."
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        {flatRequirements.length === 0 ? (
          <p className="text-sm text-slate-500">
            No requirements match. Add features and requirements in Product Explorer or adjust filters.
          </p>
        ) : (
          <div className="flex gap-4">
            <DroppableColumn
              columnId={COL_OPEN}
              title={t("common.open")}
              count={openItems.length}
            >
              {byFeature.map((group) => {
                const items = group.items.filter((i) => !requirementIsDone(i.requirement));
                if (items.length === 0) return null;
                return (
                  <div key={group.featureId} className="space-y-1.5">
                    <p className="text-[11px] font-medium text-slate-500">
                      {group.featureTitle}
                    </p>
                    {items.map((item) => (
                      <DraggableRequirementCard key={item.requirement.id} item={item} />
                    ))}
                  </div>
                );
              })}
            </DroppableColumn>
            <DroppableColumn
              columnId={COL_DONE}
              title={t("common.done")}
              count={doneItems.length}
            >
              {byFeature.map((group) => {
                const items = group.items.filter((i) => requirementIsDone(i.requirement));
                if (items.length === 0) return null;
                return (
                  <div key={group.featureId} className="space-y-1.5">
                    <p className="text-[11px] font-medium text-slate-500">
                      {group.featureTitle}
                    </p>
                    {items.map((item) => (
                      <DraggableRequirementCard key={item.requirement.id} item={item} />
                    ))}
                  </div>
                );
              })}
            </DroppableColumn>
          </div>
        )}
      </div>

      <DragOverlay>
        {activeItem ? (
          <div className="rotate-1 opacity-95">
            <RequirementCard item={activeItem} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
