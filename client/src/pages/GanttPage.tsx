import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Gantt, ViewMode } from "gantt-task-react";
import type { Task } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import { api } from "../lib/api";
import type { GanttTask, Initiative } from "../types/models";
import { Card } from "../components/ui/Card";

type Props = {
  initiatives?: Initiative[];
  onOpen?: (initiative: Initiative) => void;
};

type GanttViewMode = ViewMode | "Quarter";

const VIEW_OPTIONS: { labelKey: string; value: GanttViewMode }[] = [
  { labelKey: "gantt.day", value: ViewMode.Day },
  { labelKey: "gantt.week", value: ViewMode.Week },
  { labelKey: "gantt.month", value: ViewMode.Month },
  { labelKey: "gantt.quarter", value: "Quarter" },
  { labelKey: "gantt.year", value: ViewMode.Year },
];

function lighten(hex: string, amount = 0.25): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const lr = Math.min(255, Math.round(r + (255 - r) * amount));
  const lg = Math.min(255, Math.round(g + (255 - g) * amount));
  const lb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

function darken(hex: string, amount = 0.2): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const dr = Math.max(0, Math.round(r * (1 - amount)));
  const dg = Math.max(0, Math.round(g * (1 - amount)));
  const db = Math.max(0, Math.round(b * (1 - amount)));
  return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}

function toGanttTasks(raw: GanttTask[], allIds: Set<string>): (Task & { domain?: string; timelineExtended?: boolean })[] {
  return raw
    .filter((t) => t.startDate && t.targetDate)
    .map((t) => {
      const start = new Date(t.startDate!);
      const end = new Date(t.targetDate!);
      if (end <= start) end.setDate(start.getDate() + 1);
      const bg = t.statusColor ?? t.domainColor ?? "#3b82f6";

      return {
        id: t.id,
        name: t.title,
        type: "task" as const,
        start,
        end,
        progress: t.progress,
        dependencies: t.dependencies.filter((d) => allIds.has(d)),
        isDisabled: true,
        domain: t.domain,
        timelineExtended: t.timelineExtended,
        styles: {
          backgroundColor: bg,
          backgroundSelectedColor: lighten(bg, 0.15),
          progressColor: darken(bg, 0.15),
          progressSelectedColor: darken(bg, 0.1),
        },
      };
    });
}

function CustomTooltip({ task }: { task: Task & { domain?: string; timelineExtended?: boolean }; fontSize: string; fontFamily: string }) {
  const { t } = useTranslation();
  const pct = Math.round(task.progress);
  const extended = (task as Task & { timelineExtended?: boolean }).timelineExtended;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg" style={{ minWidth: 200 }}>
      <p className="mb-1 text-sm font-semibold text-slate-900">{task.name}</p>
      {task.domain ? <p className="mb-0.5 text-xs text-slate-500">{task.domain}</p> : null}
      {extended ? (
        <p className="mb-0.5 text-xs font-medium text-amber-700">{t("gantt.timelineExtended")}</p>
      ) : null}
      <p className="text-xs text-slate-500">
        {task.start.toLocaleDateString()} &ndash; {task.end.toLocaleDateString()}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: task.styles?.progressColor ?? "#3b82f6" }}
          />
        </div>
        <span className="text-xs font-medium text-slate-600">{pct}%</span>
      </div>
    </div>
  );
}

export function GanttPage({ initiatives, onOpen }: Props) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState<GanttTask[]>([]);
  const [viewMode, setViewMode] = useState<GanttViewMode>(ViewMode.Month);
  const today = useMemo(() => new Date(), []);
  const oneYearOut = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }, []);

  useEffect(() => {
    void api.getGantt().then((result) => setRaw(result.tasks));
  }, []);

  const ganttTasks = useMemo(() => {
    const withDates = raw.filter((t) => {
      if (!t.startDate || !t.targetDate) return false;
      const end = new Date(t.targetDate);
      const start = new Date(t.startDate);
      return end >= today && start <= oneYearOut;
    });
    const idSet = new Set(withDates.map((t) => t.id));
    return toGanttTasks(
      raw.filter((t) => idSet.has(t.id)),
      idSet
    );
  }, [raw, today, oneYearOut]);

  const statusLegend = useMemo(() => {
    const order = ["IDEA", "PLANNED", "IN_PROGRESS", "DONE", "BLOCKED"] as const;
    const colors: Record<string, string> = {
      IDEA: "#94a3b8",
      PLANNED: "#3b82f6",
      IN_PROGRESS: "#f59e0b",
      DONE: "#22c55e",
      BLOCKED: "#ef4444"
    };
    return order.map((s) => ({ status: s, color: colors[s] }));
  }, []);

  const skipped = raw.length - ganttTasks.length;

  const handleClick = (task: Task) => {
    if (!onOpen || !initiatives) return;
    const found = initiatives.find((i) => i.id === task.id);
    if (found) onOpen(found);
  };

  const effectiveViewMode: ViewMode = viewMode === "Quarter" ? ViewMode.Month : viewMode;
  const columnWidth =
    viewMode === ViewMode.Year
      ? 350
      : viewMode === "Quarter"
        ? 180
        : viewMode === ViewMode.Month
          ? 200
          : viewMode === ViewMode.Week
            ? 100
            : 50;

  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("gantt.title")}</h2>
          <p className="text-sm text-slate-500">
            {t("gantt.subtitle", { count: ganttTasks.length })}
            {skipped > 0 && (
              <span className="ml-1 text-amber-600">
                {t("gantt.hidden", { count: skipped })}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setViewMode(opt.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === opt.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {statusLegend.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="font-medium">{t("gantt.statusLegend")}</span>
          {statusLegend.map(({ status, color }) => (
            <span key={status} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: color }} />
              {t(`gantt.status.${status}`)}
            </span>
          ))}
        </div>
      )}

      <p className="mb-3 text-xs text-slate-500 italic">
        {t("gantt.prolongedNote")}
      </p>

      {ganttTasks.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">
          {t("gantt.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0" style={{ WebkitOverflowScrolling: "touch" }}>
          <Gantt
            tasks={ganttTasks}
            viewMode={effectiveViewMode}
            viewDate={today}
            onClick={handleClick}
            TooltipContent={CustomTooltip}
            columnWidth={columnWidth}
            rowHeight={42}
            barFill={60}
            headerHeight={50}
            listCellWidth=""
            ganttHeight={Math.min(600, ganttTasks.length * 42 + 60)}
          />
        </div>
      )}
    </Card>
  );
}
