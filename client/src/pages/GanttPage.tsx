import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { GanttTask } from "../types/models";
import { Card } from "../components/ui/Card";

export function GanttPage() {
  const [tasks, setTasks] = useState<GanttTask[]>([]);

  useEffect(() => {
    void api.getGantt().then((result) => setTasks(result.tasks));
  }, []);

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-lg font-semibold">Gantt</h2>
      <div className="grid gap-2">
        {tasks.map((task) => (
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
