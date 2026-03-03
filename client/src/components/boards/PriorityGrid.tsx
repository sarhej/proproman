import type { Initiative } from "../../types/models";
import { formatCommercial, formatHorizon, formatStatus } from "../../lib/format";

type Props = {
  initiatives: Initiative[];
  onOpen: (initiative: Initiative) => void;
};

export function PriorityGrid({ initiatives, onOpen }: Props) {
  const sorted = [...initiatives].sort((a, b) => a.priority.localeCompare(b.priority) || a.horizon.localeCompare(b.horizon));

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left">Title</th>
            <th className="px-3 py-2 text-left">Domain</th>
            <th className="px-3 py-2 text-left">Owner</th>
            <th className="px-3 py-2 text-left">Priority</th>
            <th className="px-3 py-2 text-left">Horizon</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Commercial</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((initiative) => (
            <tr key={initiative.id} className="cursor-pointer border-t hover:bg-slate-50" onClick={() => onOpen(initiative)}>
              <td className="px-3 py-2 font-medium">{initiative.title}</td>
              <td className="px-3 py-2">{initiative.domain.name}</td>
              <td className="px-3 py-2">{initiative.owner?.name || "Unassigned"}</td>
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
