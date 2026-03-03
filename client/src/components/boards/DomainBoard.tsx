import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }));
}

function SortableInitiative({ initiative, onOpen }: { initiative: Initiative; onOpen: (initiative: Initiative) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: initiative.id,
    data: {
      type: "initiative",
      initiative
    }
  });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners}>
      <InitiativeCard initiative={initiative} onClick={() => onOpen(initiative)} />
    </div>
  );
}

export function DomainBoard({ domains, initiatives, onOpen, onReorder }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const grouped = groupByDomain(domains, initiatives);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeInit = initiatives.find((i) => i.id === active.id);
    if (!activeInit) return;

    const overInit = initiatives.find((i) => i.id === over.id);
    const targetDomainId = overInit?.domainId ?? activeInit.domainId;

    const sameDomain = activeInit.domainId === targetDomainId;
    let next = [...initiatives];

    if (sameDomain && overInit) {
      const currentDomainItems = initiatives.filter((i) => i.domainId === activeInit.domainId).sort((a, b) => a.sortOrder - b.sortOrder);
      const oldIndex = currentDomainItems.findIndex((i) => i.id === active.id);
      const newIndex = currentDomainItems.findIndex((i) => i.id === over.id);
      const moved = arrayMove(currentDomainItems, oldIndex, newIndex).map((item, index) => ({
        ...item,
        sortOrder: index
      }));
      next = next.map((i) => moved.find((m) => m.id === i.id) || i);
    } else {
      next = next.map((i) => (i.id === activeInit.id ? { ...i, domainId: targetDomainId } : i));
      const byDomain = groupByDomain(domains, next);
      const normalized = byDomain.flatMap(({ items }) => items.map((item, index) => ({ ...item, sortOrder: index })));
      next = next.map((i) => normalized.find((n) => n.id === i.id) || i);
    }

    await onReorder(next);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {grouped.map(({ domain, items }) => (
          <Card key={domain.id} className="min-h-[360px] p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold">{domain.name}</p>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{items.length}</span>
            </div>
            <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div className="grid gap-2">
                {items.map((initiative) => (
                  <SortableInitiative key={initiative.id} initiative={initiative} onOpen={onOpen} />
                ))}
              </div>
            </SortableContext>
          </Card>
        ))}
      </div>
    </DndContext>
  );
}
