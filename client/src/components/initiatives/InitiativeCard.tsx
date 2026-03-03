import type { Initiative } from "../../types/models";
import { Card } from "../ui/Card";

type Props = {
  initiative: Initiative;
  onClick?: () => void;
};

export function InitiativeCard({ initiative, onClick }: Props) {
  return (
    <Card className="cursor-pointer p-3 hover:border-sky-300" onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-semibold">{initiative.title}</p>
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
            Open
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="rounded bg-slate-100 px-2 py-0.5">{initiative.priority}</span>
        <span className="rounded bg-slate-100 px-2 py-0.5">{initiative.horizon}</span>
        <span className="rounded bg-slate-100 px-2 py-0.5">{initiative.status}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">{initiative.owner?.name || "Unassigned"}</p>
    </Card>
  );
}
