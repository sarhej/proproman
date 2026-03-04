import { useTranslation } from "react-i18next";
import type { Initiative } from "../../types/models";
import { formatCommercial, formatHorizon, formatStatus } from "../../lib/format";
import { DomainBadge } from "../ui/DomainBadge";

type Props = {
  initiatives: Initiative[];
  onOpen: (initiative: Initiative) => void;
};

export function PriorityGrid({ initiatives, onOpen }: Props) {
  const { t } = useTranslation();
  const sorted = [...initiatives].sort((a, b) => a.priority.localeCompare(b.priority) || a.horizon.localeCompare(b.horizon));

  return (
    <>
      {/* Mobile card view */}
      <div className="grid gap-3 lg:hidden">
        {sorted.map((initiative) => (
          <div
            key={initiative.id}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 active:bg-slate-50"
            onClick={() => onOpen(initiative)}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">{initiative.title}</span>
              <span className="text-slate-400">&#x203A;</span>
            </div>
            <div className="mb-2 text-xs text-slate-500">
              {initiative.domain.name} &middot; {initiative.owner?.name || t("common.unassigned")}
            </div>
            <div className="flex flex-wrap gap-1">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium">{initiative.priority}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{formatHorizon(initiative.horizon)}</span>
              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700 capitalize">{formatStatus(initiative.status)}</span>
              <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] capitalize">{formatCommercial(initiative.commercialType)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table view */}
      <div className="hidden lg:block overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">{t("priorityGrid.title")}</th>
              <th className="px-3 py-2 text-left">{t("priorityGrid.domain")}</th>
              <th className="px-3 py-2 text-left">{t("priorityGrid.owner")}</th>
              <th className="px-3 py-2 text-left">{t("priorityGrid.priority")}</th>
              <th className="px-3 py-2 text-left">{t("priorityGrid.horizon")}</th>
              <th className="px-3 py-2 text-left">{t("priorityGrid.status")}</th>
              <th className="px-3 py-2 text-left">{t("priorityGrid.commercial")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((initiative) => (
              <tr key={initiative.id} className="cursor-pointer border-t hover:bg-slate-50" onClick={() => onOpen(initiative)}>
                <td className="px-3 py-2 font-medium">{initiative.title}</td>
                <td className="px-3 py-2">
                  <DomainBadge name={initiative.domain.name} color={initiative.domain.color} />
                </td>
                <td className="px-3 py-2">{initiative.owner?.name || t("common.unassigned")}</td>
                <td className="px-3 py-2">{initiative.priority}</td>
                <td className="px-3 py-2">{formatHorizon(initiative.horizon)}</td>
                <td className="px-3 py-2 capitalize">{formatStatus(initiative.status)}</td>
                <td className="px-3 py-2 capitalize">{formatCommercial(initiative.commercialType)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
