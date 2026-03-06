import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { Domain, Initiative, InitiativeMilestone, MilestoneStatus, User } from "../types/models";
import { Card } from "../components/ui/Card";

type MilestoneRow = InitiativeMilestone & {
  initiative: {
    id: string;
    title: string;
    domain: { id: string; name: string; color: string };
    owner: { id: string; name: string } | null;
  };
};

type Props = {
  domains: Domain[];
  users: User[];
  onOpenInitiative?: (initiative: Initiative) => void;
  initiatives: Initiative[];
  readOnly: boolean;
};

const STATUSES: MilestoneStatus[] = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"];
const STATUS_STYLES: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE: "bg-green-100 text-green-700",
  BLOCKED: "bg-red-100 text-red-700",
};

type Period = "week" | "month" | "quarter" | "overdue" | "all";

function daysDiff(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const target = new Date(targetDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
}

function isOverdue(m: MilestoneRow): boolean {
  if (m.status === "DONE") return false;
  const diff = daysDiff(m.targetDate);
  return diff !== null && diff > 0;
}

function inPeriod(m: MilestoneRow, period: Period): boolean {
  if (period === "all") return true;
  if (period === "overdue") return isOverdue(m);
  if (!m.targetDate) return period === "all";
  const target = new Date(m.targetDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(now);
  if (period === "week") end.setDate(end.getDate() + 7);
  else if (period === "month") end.setMonth(end.getMonth() + 1);
  else if (period === "quarter") end.setMonth(end.getMonth() + 3);
  return target <= end;
}

function InlineSelect<T extends string>({ value, options, onSave, renderLabel }: {
  value: T; options: T[]; onSave: (v: T) => void; renderLabel: (v: T) => string;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <span className={`inline-block cursor-pointer rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[value] ?? ""} hover:ring-1 hover:ring-blue-200`} onClick={() => setEditing(true)}>
        {renderLabel(value)}
      </span>
    );
  }
  return (
    <select
      ref={ref}
      className="rounded border-2 border-sky-500 px-1 py-0.5 text-sm outline-none"
      value={value}
      onChange={(e) => { onSave(e.target.value as T); setEditing(false); }}
      onBlur={() => setEditing(false)}
    >
      {options.map((o) => <option key={o} value={o}>{renderLabel(o)}</option>)}
    </select>
  );
}

function InlineDate({ value, onSave }: { value: string | null | undefined; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const display = value ? value.slice(0, 10) : "";
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <span className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-blue-50 hover:ring-1 hover:ring-blue-200" onClick={() => setEditing(true)}>
        {display || "—"}
      </span>
    );
  }
  return (
    <input
      ref={ref}
      type="date"
      className="rounded border-2 border-sky-500 px-1 py-0.5 text-sm outline-none"
      defaultValue={display}
      onBlur={(e) => { setEditing(false); const v = e.target.value; onSave(v ? `${v}T00:00:00.000Z` : null); }}
      onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
    />
  );
}

function InlineOwnerSelect({ value, users, onSave }: { value: string | null; users: User[]; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const display = users.find((u) => u.id === value)?.name ?? "—";
  if (!editing) {
    return (
      <span className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-blue-50 hover:ring-1 hover:ring-blue-200" onClick={() => setEditing(true)}>
        {display}
      </span>
    );
  }
  return (
    <select
      ref={ref}
      className="rounded border-2 border-sky-500 px-1 py-0.5 text-sm outline-none"
      value={value ?? ""}
      onChange={(e) => { onSave(e.target.value || null); setEditing(false); }}
      onBlur={() => setEditing(false)}
    >
      <option value="">—</option>
      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  );
}

export function MilestonesTimelinePage({ domains, users, onOpenInitiative, initiatives, readOnly }: Props) {
  const { t } = useTranslation();
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [domainFilter, setDomainFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState<Period>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const res = await api.getAllMilestones();
    setMilestones(res.milestones as MilestoneRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const result = milestones.filter((m) => {
      if (domainFilter && m.initiative.domain.id !== domainFilter) return false;
      if (ownerFilter && m.ownerId !== ownerFilter) return false;
      if (statusFilter && m.status !== statusFilter) return false;
      if (!inPeriod(m, periodFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!m.title.toLowerCase().includes(q) && !m.initiative.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      const aOver = isOverdue(a) ? 0 : 1;
      const bOver = isOverdue(b) ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const aDate = a.targetDate ? new Date(a.targetDate).getTime() : Infinity;
      const bDate = b.targetDate ? new Date(b.targetDate).getTime() : Infinity;
      return aDate - bDate;
    });
    return result;
  }, [milestones, domainFilter, ownerFilter, statusFilter, periodFilter, search]);

  const counts = useMemo(() => {
    const c = { total: filtered.length, TODO: 0, IN_PROGRESS: 0, DONE: 0, BLOCKED: 0, overdue: 0 };
    filtered.forEach((m) => {
      c[m.status as keyof typeof c]++;
      if (isOverdue(m)) c.overdue++;
    });
    return c;
  }, [filtered]);

  async function updateField(id: string, field: string, value: unknown) {
    await api.updateMilestone(id, { [field]: value });
    await load();
  }

  async function deleteMilestone(id: string, title: string) {
    if (!window.confirm(t("milestonesTimeline.deleteConfirm", { name: title }))) return;
    await api.deleteMilestone(id);
    await load();
  }

  function handleOpenInitiative(initiativeId: string) {
    const full = initiatives.find((i) => i.id === initiativeId);
    if (full && onOpenInitiative) onOpenInitiative(full);
  }

  if (loading) return <Card className="p-8 text-center text-slate-400">{t("common.loading")}</Card>;

  return (
    <Card className="p-4">
      <h2 className="mb-4 text-lg font-bold">{t("milestonesTimeline.title")}</h2>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3">
        <select className="rounded border border-slate-300 px-2 py-1.5 text-sm" value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
          <option value="">{t("filters.all")} — {t("filters.domain")}</option>
          {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="rounded border border-slate-300 px-2 py-1.5 text-sm" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="">{t("filters.all")} — {t("filters.owner")}</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="rounded border border-slate-300 px-2 py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t("filters.all")} — {t("common.status")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`milestoneStatus.${s}`)}</option>)}
        </select>
        <select className="rounded border border-slate-300 px-2 py-1.5 text-sm" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as Period)}>
          <option value="all">{t("milestonesTimeline.allPeriod")}</option>
          <option value="week">{t("milestonesTimeline.thisWeek")}</option>
          <option value="month">{t("milestonesTimeline.thisMonth")}</option>
          <option value="quarter">{t("milestonesTimeline.thisQuarter")}</option>
          <option value="overdue">{t("milestonesTimeline.overdueOnly")}</option>
        </select>
        <input
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          placeholder={t("milestonesTimeline.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">{t("milestonesTimeline.total")}</div>
          <div className="mt-1 text-2xl font-bold">{counts.total}</div>
        </div>
        <div className="rounded-xl border border-green-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-green-600">{t("milestoneStatus.DONE")}</div>
          <div className="mt-1 text-2xl font-bold text-green-600">{counts.DONE}</div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-blue-600">{t("milestoneStatus.IN_PROGRESS")}</div>
          <div className="mt-1 text-2xl font-bold text-blue-600">{counts.IN_PROGRESS}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">{t("milestoneStatus.TODO")}</div>
          <div className="mt-1 text-2xl font-bold text-slate-500">{counts.TODO}</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-red-600">{t("milestoneStatus.BLOCKED")}</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{counts.BLOCKED}</div>
        </div>
        <div className="rounded-xl border border-orange-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-orange-600">{t("milestonesTimeline.overdue")}</div>
          <div className="mt-1 text-2xl font-bold text-orange-600">{counts.overdue}</div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">{t("kpiDashboard.initiative")}</th>
              <th className="px-3 py-2">{t("filters.domain")}</th>
              <th className="px-3 py-2">{t("milestonesTimeline.milestone")}</th>
              <th className="px-3 py-2">{t("common.status")}</th>
              <th className="px-3 py-2">{t("initiative.targetDate")}</th>
              <th className="px-3 py-2">{t("initiative.owner")}</th>
              <th className="px-3 py-2">{t("milestonesTimeline.delay")}</th>
              {!readOnly && <th className="px-3 py-2">{t("common.actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const overdue = isOverdue(m);
              const diff = daysDiff(m.targetDate);
              return (
                <tr key={m.id} className={`border-t border-slate-200 ${overdue ? "bg-red-50" : "hover:bg-slate-50/50"}`}>
                  <td className="px-3 py-2">
                    <button className="text-left font-medium text-blue-600 hover:underline" onClick={() => handleOpenInitiative(m.initiative.id)}>
                      {m.initiative.title}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: m.initiative.domain.color + "22", color: m.initiative.domain.color }}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.initiative.domain.color }} />
                      {m.initiative.domain.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">{m.title}</td>
                  <td className="px-3 py-2">
                    {readOnly ? (
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[m.status]}`}>
                        {t(`milestoneStatus.${m.status}`)}
                      </span>
                    ) : (
                      <InlineSelect
                        value={m.status}
                        options={STATUSES}
                        onSave={(v) => updateField(m.id, "status", v)}
                        renderLabel={(v) => t(`milestoneStatus.${v}`)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {readOnly ? (
                      <span className={overdue ? "font-semibold text-red-600" : ""}>{m.targetDate ? m.targetDate.slice(0, 10) : "—"}</span>
                    ) : (
                      <InlineDate value={m.targetDate} onSave={(v) => updateField(m.id, "targetDate", v)} />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {readOnly ? (
                      <span>{m.owner?.name ?? "—"}</span>
                    ) : (
                      <InlineOwnerSelect value={m.ownerId ?? null} users={users} onSave={(v) => updateField(m.id, "ownerId", v)} />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {overdue && diff !== null ? (
                      <span className="font-bold text-red-600">{diff} {t("milestonesTimeline.days")}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2">
                      <button className="text-xs font-medium text-red-500 hover:text-red-700" onClick={() => deleteMilestone(m.id, m.title)}>
                        {t("common.delete")}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 7 : 8} className="px-3 py-8 text-center text-slate-400">{t("common.none")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
