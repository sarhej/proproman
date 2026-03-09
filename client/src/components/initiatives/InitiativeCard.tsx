import { useTranslation } from "react-i18next";
import type { Initiative } from "../../types/models";
import { formatHorizon, formatPriority, formatStatus } from "../../lib/format";
import { Card } from "../ui/Card";
import { DomainBadge } from "../ui/DomainBadge";

type Props = {
  initiative: Initiative;
  onClick?: () => void;
};

function formatDateShort(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function InitiativeCard({ initiative, onClick }: Props) {
  const { t } = useTranslation();
  const timing =
    initiative.startDate && initiative.targetDate
      ? `${formatDateShort(initiative.startDate)} \u2013 ${formatDateShort(initiative.targetDate)}`
      : formatHorizon(initiative.horizon);
  return (
    <Card className="cursor-pointer p-3 hover:border-sky-300" onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-base font-semibold text-slate-900">{initiative.title}</p>
        {onClick ? (
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClick();
            }}
          >
            {t("common.open")}
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="rounded bg-slate-100 px-2 py-0.5" title={t("initiative.priority")}>{formatPriority(initiative.priority)}</span>
        <span className="rounded bg-slate-100 px-2 py-0.5" title={t("filters.horizon")}>{timing}</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 capitalize" title={t("common.status")}>{formatStatus(initiative.status)}</span>
      </div>
      {initiative.domain?.color && (
        <div className="mt-1.5">
          <DomainBadge name={initiative.domain.name} color={initiative.domain.color} />
        </div>
      )}
      <p className="mt-1 text-xs text-slate-500" title={t("initiative.owner")}>
        {initiative.owner?.name || t("common.unassigned")}
      </p>
    </Card>
  );
}
