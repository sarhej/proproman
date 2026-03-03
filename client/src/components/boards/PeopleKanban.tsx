import {
  DndContext, type DragEndEvent, type DragStartEvent,
  PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay
} from "@dnd-kit/core";
import { useState } from "react";
import type { Initiative, User } from "../../types/models";
import { InitiativeCard } from "../initiatives/InitiativeCard";
import { Card } from "../ui/Card";

type Props = {
  initiatives: Initiative[];
  users: User[];
  onOpen: (initiative: Initiative) => void;
  onReassign: (initiative: Initiative, userId: string | null) => Promise<void>;
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

function DroppableColumn({ laneId, children }: { laneId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane-${laneId}` });
  return (
    <Card className={`min-h-[360px] p-2 transition-colors ${isOver ? "ring-2 ring-sky-400 bg-sky-50/50" : ""}`}>
      <div ref={setNodeRef} className="min-h-[300px]">
        {children}
      </div>
    </Card>
  );
}

export function PeopleKanban({ initiatives, users, onOpen, onReassign }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

  const lanes = [...users.map((u) => ({ id: u.id, name: u.name })), { id: "unassigned", name: "Unassigned" }];

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

    if (overId.startsWith("lane-")) {
      const targetLaneId = overId.replace("lane-", "");
      const targetUserId = targetLaneId === "unassigned" ? null : targetLaneId;
      if (initiative.ownerId !== targetUserId) {
        await onReassign(initiative, targetUserId);
      }
    } else {
      const overInitiative = initiatives.find((i) => i.id === overId);
      if (overInitiative && initiative.ownerId !== overInitiative.ownerId) {
        await onReassign(initiative, overInitiative.ownerId ?? null);
      }
    }
  }

  const activeInitiative = activeId ? initiatives.find((i) => i.id === activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {lanes.map((lane) => {
          const items = initiatives.filter((i) => (lane.id === "unassigned" ? !i.ownerId : i.ownerId === lane.id));
          return (
            <DroppableColumn key={lane.id} laneId={lane.id}>
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-sm font-semibold">{lane.name}</p>
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
