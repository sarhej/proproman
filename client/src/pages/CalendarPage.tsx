import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { CalendarItem } from "../types/models";
import { Card } from "../components/ui/Card";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = { quickFilter?: string };
type ViewMode = "agenda" | "calendar";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function getMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = new Array(startDay).fill(null);

  for (let day = 1; day <= daysInMonth; day++) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

const MAX_PILLS_PER_CELL = 3;

export function CalendarPage({ quickFilter }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [view, setView] = useState<ViewMode>(() =>
    window.matchMedia("(max-width: 1023px)").matches ? "agenda" : "calendar"
  );
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useEffect(() => {
    void api.getCalendar().then((result) => setItems(result.items));
  }, []);

  const filteredItems = useMemo(() => {
    const q = quickFilter?.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.title.toLowerCase().includes(q));
  }, [quickFilter, items]);

  function prevMonth() {
    setCurrentMonth((prev) => {
      const m = prev.month - 1;
      return m < 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: m };
    });
  }

  function nextMonth() {
    setCurrentMonth((prev) => {
      const m = prev.month + 1;
      return m > 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: m };
    });
  }

  function goToday() {
    const now = new Date();
    setCurrentMonth({ year: now.getFullYear(), month: now.getMonth() });
  }

  const monthLabel = new Date(currentMonth.year, currentMonth.month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  const todayStr = toDateStr(new Date());

  const dayItemsMap = useMemo(() => {
    const map = new Map<string, { item: CalendarItem; isMilestone: boolean }[]>();
    const { year, month } = currentMonth;
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    for (const item of filteredItems) {
      const start = parseDate(item.startDate);
      const target = parseDate(item.targetDate);
      const milestone = parseDate(item.milestoneDate);

      if (start && target) {
        const lo = new Date(Math.max(start.getTime(), monthStart.getTime()));
        const hi = new Date(Math.min(target.getTime(), monthEnd.getTime()));
        for (let d = new Date(lo); d <= hi; d.setDate(d.getDate() + 1)) {
          const key = toDateStr(d);
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push({ item, isMilestone: false });
        }
      } else if (target) {
        if (target.getMonth() === month && target.getFullYear() === year) {
          const key = toDateStr(target);
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push({ item, isMilestone: false });
        }
      } else if (start) {
        if (start.getMonth() === month && start.getFullYear() === year) {
          const key = toDateStr(start);
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push({ item, isMilestone: false });
        }
      }

      if (milestone && milestone.getMonth() === month && milestone.getFullYear() === year) {
        const key = toDateStr(milestone);
        if (!map.has(key)) map.set(key, []);
        const existing = map.get(key)!;
        if (!existing.some((e) => e.item.id === item.id)) {
          existing.push({ item, isMilestone: true });
        } else {
          const idx = existing.findIndex((e) => e.item.id === item.id);
          if (idx >= 0) existing[idx].isMilestone = true;
        }
      }
    }
    return map;
  }, [filteredItems, currentMonth]);

  const weeks = getMonthGrid(currentMonth.year, currentMonth.month);

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("calendar.title")}</h2>
        <div className="flex gap-1 rounded-lg border p-0.5">
          <button
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${view === "calendar" ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
            onClick={() => setView("calendar")}
          >
            {t("calendar.calendarView")}
          </button>
          <button
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${view === "agenda" ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
            onClick={() => setView("agenda")}
          >
            {t("calendar.agendaView")}
          </button>
        </div>
      </div>

      {view === "agenda" ? (
        <AgendaView items={filteredItems} />
      ) : (
        <div>
          <div className="mb-3 flex items-center gap-3">
            <button onClick={prevMonth} className="rounded p-1 hover:bg-gray-100" aria-label={t("calendar.prevMonth")}>
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
            <span className="min-w-[160px] text-center text-sm font-semibold">{monthLabel}</span>
            <button onClick={nextMonth} className="rounded p-1 hover:bg-gray-100" aria-label={t("calendar.nextMonth")}>
              <ChevronRight className="h-5 w-5 text-gray-600" />
            </button>
            <button onClick={goToday} className="ml-1 rounded border px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50">
              {t("common.today")}
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500 border-b pb-1 mb-1">
            {[t("calendar.mon"), t("calendar.tue"), t("calendar.wed"), t("calendar.thu"), t("calendar.fri"), t("calendar.sat"), t("calendar.sun")].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {weeks.flat().map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="min-h-[80px] border border-gray-100 bg-gray-50/50" />;
              }
              const dateStr = toDateStr(new Date(currentMonth.year, currentMonth.month, day));
              const isToday = dateStr === todayStr;
              const dayEntries = dayItemsMap.get(dateStr) ?? [];
              const visible = dayEntries.slice(0, MAX_PILLS_PER_CELL);
              const overflow = dayEntries.length - MAX_PILLS_PER_CELL;

              return (
                <div
                  key={dateStr}
                  className={`min-h-[80px] border border-gray-100 p-1 ${isToday ? "bg-indigo-50/60" : ""}`}
                >
                  <div className={`mb-0.5 text-xs ${isToday ? "font-bold text-indigo-600" : "text-gray-400"}`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {visible.map(({ item, isMilestone }) => (
                      <div
                        key={item.id}
                        className="group relative cursor-default truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight text-white"
                        style={{ backgroundColor: item.domainColor }}
                      >
                        {isMilestone && <span className="mr-0.5">◆</span>}
                        {item.title}
                        <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-48 rounded-md border bg-white p-2 text-xs shadow-lg group-hover:block">
                          <p className="font-semibold text-gray-900">{item.title}</p>
                          <p className="text-gray-500">{t("calendar.domain")} {item.domain}</p>
                          <p className="text-gray-500">{t("calendar.owner")} {item.owner ?? t("common.unassigned")}</p>
                          {item.startDate && (
                            <p className="text-gray-500">{t("calendar.start")} {new Date(item.startDate).toLocaleDateString()}</p>
                          )}
                          {item.targetDate && (
                            <p className="text-gray-500">{t("calendar.target")} {new Date(item.targetDate).toLocaleDateString()}</p>
                          )}
                          {isMilestone && item.milestoneDate && (
                            <p className="text-amber-600 font-medium">
                              {t("calendar.milestone")} {new Date(item.milestoneDate).toLocaleDateString()}
                            </p>
                          )}
                          {item.dateConfidence && (
                            <p className="text-gray-400">{t("calendar.confidence")} {item.dateConfidence}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div className="text-[10px] text-gray-400 pl-1">+{overflow} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredItems.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3 text-[10px]">
              {Array.from(new Map(filteredItems.map((i) => [i.domainId, { name: i.domain, color: i.domainColor }])).entries()).map(
                ([id, { name, color }]) => (
                  <span key={id} className="flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
                    {name}
                  </span>
                )
              )}
              <span className="flex items-center gap-1 text-gray-500">{t("calendar.milestoneLegend")}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function AgendaView({ items }: { items: CalendarItem[] }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2">
      {items.length === 0 && <p className="text-sm text-gray-500">{t("calendar.noItems")}</p>}
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
        >
          <span
            className="mt-1.5 inline-block h-3 w-3 shrink-0 rounded-sm"
            style={{ backgroundColor: item.domainColor }}
            title={item.domain}
          />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{item.title}</div>
            <div className="text-slate-500">
              {t("calendar.startLabel")} {item.startDate ? new Date(item.startDate).toLocaleDateString() : "–"} · {t("calendar.targetLabel")}{" "}
              {item.targetDate ? new Date(item.targetDate).toLocaleDateString() : "–"} · {t("calendar.milestoneLabel")}{" "}
              {item.milestoneDate ? new Date(item.milestoneDate).toLocaleDateString() : "–"}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              {item.domain} · {item.owner ?? t("common.unassigned")}
              {item.dateConfidence && ` · ${t("calendar.confidence")} ${item.dateConfidence}`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
