import {
  DndContext, type DragEndEvent, type DragStartEvent,
  PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay
} from "@dnd-kit/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Initiative, InitiativeStatus } from "../../types/models";
import { InitiativeCard } from "../initiatives/InitiativeCard";
import { Card } from "../ui/Card";

const statuses: InitiativeStatus[] = ["IDEA", "PLANNED", "IN_PROGRESS", "BLOCKED", "DONE"];

type Props = {
  initiatives: Initiative[];
  onOpen: (initiative: Initiative) => void;
  onMove: (initiative: Initiative, nextStatus: InitiativeStatus) => Promise<void>;
};

function DraggableCard({ initiative, onOpen }: { initiative: Initiative; onOpen: (i: Initiative) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: initiative.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={isDragging ? "opacity-30" : ""}>
      <InitiativeCard initiative={initiative} onClick={() => onOpen(initiative)} />
    </div>
  );
}

function DroppableColumn({ status, children }: { status: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status}` });
  return (
    <Card className={`min-h-[360px] p-2 transition-colors ${isOver ? "ring-2 ring-sky-400 bg-sky-50/50" : ""}`}>
      <div ref={setNodeRef} className="min-h-[300px]">
        {children}
      </div>
    </Card>
  );
}

export function StatusKanban({ initiatives, onOpen, onMove }: Props) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const initiative = initiatives.find((i) => i.id === String(active.id));
    if (!initiative) return;

    const overId = String(over.id);

    if (overId.startsWith("column-")) {
      const targetStatus = overId.replace("column-", "") as InitiativeStatus;
      if (initiative.status !== targetStatus) {
        await onMove(initiative, targetStatus);
      }
    } else {
      const overInitiative = initiatives.find((i) => i.id === overId);
      if (overInitiative && initiative.status !== overInitiative.status) {
        await onMove(initiative, overInitiative.status);
      }
    }
  }

  const activeInitiative = activeId ? initiatives.find((i) => i.id === activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        {statuses.map((status) => {
          const items = initiatives.filter((i) => i.status === status);
          return (
            <DroppableColumn key={status} status={status}>
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-sm font-semibold">{t(`status.${status}`)}</p>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{items.length}</span>
              </div>
              <div className="grid gap-2">
                {items.map((initiative) => (
                  <DraggableCard key={initiative.id} initiative={initiative} onOpen={onOpen} />
                ))}
              </div>
            </DroppableColumn>
          );
        })}
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
