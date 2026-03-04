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
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
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
  );
}
