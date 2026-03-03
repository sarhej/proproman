import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { CalendarItem } from "../types/models";
import { Card } from "../components/ui/Card";

type Props = { quickFilter?: string };

export function CalendarPage({ quickFilter }: Props) {
  const [items, setItems] = useState<CalendarItem[]>([]);

  useEffect(() => {
    void api.getCalendar().then((result) => setItems(result.items));
  }, []);

  const filteredItems = useMemo(() => {
    const q = quickFilter?.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.title.toLowerCase().includes(q));
  }, [quickFilter, items]);

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-lg font-semibold">Calendar</h2>
      <div className="grid gap-2">
        {filteredItems.map((item) => (
          <div key={item.id} className="rounded border border-slate-200 px-3 py-2 text-sm">
            <div className="font-medium">{item.title}</div>
            <div className="text-slate-500">
              Start: {item.startDate ? new Date(item.startDate).toLocaleDateString() : "-"} • Target:{" "}
              {item.targetDate ? new Date(item.targetDate).toLocaleDateString() : "-"} • Milestone:{" "}
              {item.milestoneDate ? new Date(item.milestoneDate).toLocaleDateString() : "-"}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
