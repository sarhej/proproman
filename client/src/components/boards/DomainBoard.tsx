import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { Domain, Initiative } from "../../types/models";
import { InitiativeCard } from "../initiatives/InitiativeCard";
import { Card } from "../ui/Card";

type Props = {
  domains: Domain[];
  initiatives: Initiative[];
  onOpen: (initiative: Initiative) => void;
  onReorder: (next: Initiative[]) => Promise<void>;
};

function groupByDomain(domains: Domain[], initiatives: Initiative[]) {
  return domains.map((domain) => ({
    domain,
    items: initiatives
      .filter((i) => i.domainId === domain.id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

function SortableInitiative({
  initiative,
  onOpen,
}: {
  initiative: Initiative;
  onOpen: (initiative: Initiative) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: initiative.id,
    data: { type: "initiative", initiative },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-30" : ""}
      {...attributes}
      {...listeners}
    >
      <InitiativeCard initiative={initiative} onClick={() => onOpen(initiative)} />
    </div>
  );
}

function DroppableDomainColumn({
  domain,
  children,
}: {
  domain: Domain;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `domain-${domain.id}` });
  return (
    <Card
      className={`min-h-[360px] p-2 transition-colors ${isOver ? "ring-2 ring-sky-400 bg-sky-50/50" : ""}`}
    >
      <div ref={setNodeRef} className="min-h-[300px]">
        {children}
      </div>
    </Card>
  );
}

export function DomainBoard({ domains, initiatives, onOpen, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const grouped = groupByDomain(domains, initiatives);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeInit = initiatives.find((i) => i.id === active.id);
    if (!activeInit) return;

    const overId = String(over.id);

    let targetDomainId: string;
    if (overId.startsWith("domain-")) {
      targetDomainId = overId.replace("domain-", "");
    } else {
      const overInit = initiatives.find((i) => i.id === overId);
      targetDomainId = overInit?.domainId ?? activeInit.domainId;
    }

    const sameDomain = activeInit.domainId === targetDomainId;
    let next = [...initiatives];

    if (sameDomain && !overId.startsWith("domain-")) {
      const currentDomainItems = initiatives
        .filter((i) => i.domainId === activeInit.domainId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const oldIndex = currentDomainItems.findIndex((i) => i.id === active.id);
      const newIndex = currentDomainItems.findIndex((i) => i.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const moved = arrayMove(currentDomainItems, oldIndex, newIndex).map((item, index) => ({
          ...item,
          sortOrder: index,
        }));
        next = next.map((i) => moved.find((m) => m.id === i.id) || i);
      }
    } else if (!sameDomain) {
      next = next.map((i) => (i.id === activeInit.id ? { ...i, domainId: targetDomainId } : i));
      const byDomain = groupByDomain(domains, next);
      const normalized = byDomain.flatMap(({ items }) =>
        items.map((item, index) => ({ ...item, sortOrder: index }))
      );
      next = next.map((i) => normalized.find((n) => n.id === i.id) || i);
    }

    await onReorder(next);
  }

  const activeInitiative = activeId ? initiatives.find((i) => i.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {grouped.map(({ domain, items }) => (
          <DroppableDomainColumn key={domain.id} domain={domain}>
            <div className="mb-2 rounded-t px-1">
              <div className="mb-1 h-1 rounded-full" style={{ background: domain.color }} />
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{domain.name}</p>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{items.length}</span>
              </div>
            </div>
            <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div className="grid gap-2">
                {items.map((initiative) => (
                  <SortableInitiative key={initiative.id} initiative={initiative} onOpen={onOpen} />
                ))}
              </div>
            </SortableContext>
          </DroppableDomainColumn>
        ))}
      </div>
      <DragOverlay>
        {activeInitiative ? (
          <div className="rotate-2 opacity-90">
            <InitiativeCard initiative={activeInitiative} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
