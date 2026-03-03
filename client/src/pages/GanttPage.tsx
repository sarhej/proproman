import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { GanttTask } from "../types/models";
import { Card } from "../components/ui/Card";

type Props = { quickFilter?: string };

export function GanttPage({ quickFilter }: Props) {
  const [tasks, setTasks] = useState<GanttTask[]>([]);

  useEffect(() => {
    void api.getGantt().then((result) => setTasks(result.tasks));
  }, []);

  const filteredTasks = useMemo(() => {
    const q = quickFilter?.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((task) => task.title.toLowerCase().includes(q));
  }, [quickFilter, tasks]);

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-lg font-semibold">Gantt</h2>
      <div className="grid gap-2">
        {filteredTasks.map((task) => (
          <div key={task.id} className="rounded border border-slate-200 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{task.title}</span>
              <span>{task.progress}%</span>
            </div>
            <div className="text-slate-500">
              {task.startDate ? new Date(task.startDate).toLocaleDateString() : "-"} →{" "}
              {task.targetDate ? new Date(task.targetDate).toLocaleDateString() : "-"}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
