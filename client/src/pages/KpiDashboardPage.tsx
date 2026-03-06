import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { Domain, Initiative, InitiativeKPI, User } from "../types/models";
import { Card } from "../components/ui/Card";

type KpiRow = InitiativeKPI & {
  initiative: {
    id: string;
    title: string;
    startDate: string | null;
    domain: { id: string; name: string; color: string };
    owner: { id: string; name: string } | null;
  };
};

type Props = {
  domains: Domain[];
  users: User[];
  onOpenInitiative?: (initiative: Initiative) => void;
  initiatives: Initiative[];
};

function progressPct(current: string | null | undefined, target: string | null | undefined): number | null {
  const c = parseFloat(current ?? "");
  const t = parseFloat(target ?? "");
  if (isNaN(c) || isNaN(t) || t === 0) return null;
  return Math.min(Math.round((c / t) * 100), 100);
}

function expectedProgressPct(startDate: string | null | undefined, targetDate: string | null | undefined): number | null {
  if (!startDate || !targetDate) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(targetDate).getTime();
  const now = Date.now();
  if (end <= start) return 100;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

type HealthStatus = "on_track" | "at_risk" | "off_track" | "overdue" | "no_data";

function healthStatus(actualPct: number | null, expectedPct: number | null, kpiTargetDate: string | null | undefined): HealthStatus {
  if (actualPct === null) return "no_data";
  if (kpiTargetDate && new Date(kpiTargetDate) < new Date() && actualPct < 100) return "overdue";
  if (expectedPct === null) {
    if (actualPct >= 67) return "on_track";
    if (actualPct >= 34) return "at_risk";
    return "off_track";
  }
  const gap = expectedPct - actualPct;
  if (gap <= 10) return "on_track";
  if (gap <= 30) return "at_risk";
  return "off_track";
}

const STATUS_STYLES: Record<HealthStatus, { badge: string; bar: string; label: string }> = {
  on_track: { badge: "bg-green-100 text-green-700", bar: "bg-green-500", label: "kpiDashboard.onTrack" },
  at_risk: { badge: "bg-yellow-100 text-yellow-700", bar: "bg-yellow-500", label: "kpiDashboard.atRisk" },
  off_track: { badge: "bg-red-100 text-red-700", bar: "bg-red-500", label: "kpiDashboard.offTrack" },
  overdue: { badge: "bg-orange-100 text-orange-700", bar: "bg-orange-500", label: "kpiDashboard.overdue" },
  no_data: { badge: "bg-slate-100 text-slate-500", bar: "bg-slate-300", label: "kpiDashboard.noData" },
};

function InlineCell({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <span className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-blue-50 hover:ring-1 hover:ring-blue-200" onClick={() => setEditing(true)}>
        {value || <span className="text-slate-400 italic">{placeholder ?? "—"}</span>}
      </span>
    );
  }
  return (
    <input
      ref={ref}
      className="w-full max-w-[120px] rounded border-2 border-sky-500 px-1.5 py-0.5 text-sm outline-none"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { setEditing(false); if (draft !== value) onSave(draft); }
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
    />
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
        {display || <span className="text-slate-400 italic">—</span>}
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

function computeHealth(k: KpiRow): HealthStatus {
  const pct = progressPct(k.currentValue, k.targetValue);
  const exp = expectedProgressPct(k.initiative.startDate, k.targetDate);
  return healthStatus(pct, exp, k.targetDate);
}

export function KpiDashboardPage({ domains, users, onOpenInitiative, initiatives }: Props) {
  const { t } = useTranslation();
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [domainFilter, setDomainFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const res = await api.getAllKpis();
    setKpis(res.kpis as KpiRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return kpis.filter((k) => {
      if (domainFilter && k.initiative.domain.id !== domainFilter) return false;
      if (ownerFilter && k.initiative.owner?.id !== ownerFilter) return false;
      if (statusFilter) {
        const st = computeHealth(k);
        if (st !== statusFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!k.title.toLowerCase().includes(q) && !k.initiative.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [kpis, domainFilter, ownerFilter, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { total: filtered.length, on_track: 0, at_risk: 0, off_track: 0, overdue: 0, no_data: 0 };
    filtered.forEach((k) => {
      c[computeHealth(k)]++;
    });
    return c;
  }, [filtered]);

  async function updateKpi(id: string, field: string, value: unknown) {
    await api.updateKpi(id, { [field]: value ?? null });
    await load();
  }

  function handleOpenInitiative(initiativeId: string) {
    const full = initiatives.find((i) => i.id === initiativeId);
    if (full && onOpenInitiative) onOpenInitiative(full);
  }

  if (loading) return <Card className="p-8 text-center text-slate-400">{t("common.loading")}</Card>;

  return (
    <Card className="p-4">
      <h2 className="mb-4 text-lg font-bold">{t("kpiDashboard.title")}</h2>

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
          <option value="on_track">{t("kpiDashboard.onTrack")}</option>
          <option value="at_risk">{t("kpiDashboard.atRisk")}</option>
          <option value="off_track">{t("kpiDashboard.offTrack")}</option>
          <option value="overdue">{t("kpiDashboard.overdue")}</option>
          <option value="no_data">{t("kpiDashboard.noData")}</option>
        </select>
        <input
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          placeholder={t("kpiDashboard.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">{t("kpiDashboard.total")}</div>
          <div className="mt-1 text-2xl font-bold">{counts.total}</div>
        </div>
        <div className="rounded-xl border border-green-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-green-600">{t("kpiDashboard.onTrack")}</div>
          <div className="mt-1 text-2xl font-bold text-green-600">{counts.on_track}</div>
        </div>
        <div className="rounded-xl border border-yellow-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-yellow-600">{t("kpiDashboard.atRisk")}</div>
          <div className="mt-1 text-2xl font-bold text-yellow-600">{counts.at_risk}</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-red-600">{t("kpiDashboard.offTrack")}</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{counts.off_track}</div>
        </div>
        <div className="rounded-xl border border-orange-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-orange-600">{t("kpiDashboard.overdue")}</div>
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
              <th className="px-3 py-2">KPI</th>
              <th className="px-3 py-2">{t("initiative.target")}</th>
              <th className="px-3 py-2">{t("initiative.current")}</th>
              <th className="px-3 py-2">{t("initiative.unit")}</th>
              <th className="px-3 py-2">{t("kpiDashboard.targetDate")}</th>
              <th className="px-3 py-2">{t("initiative.progress")}</th>
              <th className="px-3 py-2">{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((k) => {
              const pct = progressPct(k.currentValue, k.targetValue);
              const st = computeHealth(k);
              const styles = STATUS_STYLES[st];
              const expPct = expectedProgressPct(k.initiative.startDate, k.targetDate);
              return (
                <tr key={k.id} className="border-t border-slate-200 hover:bg-slate-50/50">
                  <td className="px-3 py-2">
                    <button className="text-left font-medium text-blue-600 hover:underline" onClick={() => handleOpenInitiative(k.initiative.id)}>
                      {k.initiative.title}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: k.initiative.domain.color + "22", color: k.initiative.domain.color }}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: k.initiative.domain.color }} />
                      {k.initiative.domain.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">{k.title}</td>
                  <td className="px-3 py-2">
                    <InlineCell value={k.targetValue ?? ""} onSave={(v) => updateKpi(k.id, "targetValue", v)} placeholder="—" />
                  </td>
                  <td className="px-3 py-2">
                    <InlineCell value={k.currentValue ?? ""} onSave={(v) => updateKpi(k.id, "currentValue", v)} placeholder="—" />
                  </td>
                  <td className="px-3 py-2">
                    <InlineCell value={k.unit ?? ""} onSave={(v) => updateKpi(k.id, "unit", v)} placeholder="—" />
                  </td>
                  <td className="px-3 py-2">
                    <InlineDate value={k.targetDate} onSave={(v) => updateKpi(k.id, "targetDate", v as unknown as string)} />
                  </td>
                  <td className="px-3 py-2">
                    {pct !== null ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <div className="relative h-2 w-24 rounded-full bg-slate-100">
                            <div className={`h-2 rounded-full ${styles.bar}`} style={{ width: `${pct}%` }} />
                            {expPct !== null && (
                              <div className="absolute top-0 h-2 w-0.5 bg-slate-600" style={{ left: `${Math.min(expPct, 100)}%` }} title={`${t("kpiDashboard.expected")}: ${expPct}%`} />
                            )}
                          </div>
                          <span className="text-xs font-semibold text-slate-500">{pct}%</span>
                        </div>
                        {expPct !== null && (
                          <span className="text-[10px] text-slate-400">{t("kpiDashboard.expected")}: {expPct}%</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${styles.badge}`}>
                      {t(styles.label)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">{t("common.none")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
