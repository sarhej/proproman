import clsx from "clsx";
import type { Initiative, Persona } from "../../types/models";

type Props = {
  initiatives: Initiative[];
  personas: Persona[];
};

function colorByImpact(impact: number): string {
  if (impact >= 5) return "bg-sky-700 text-white";
  if (impact >= 4) return "bg-sky-500 text-white";
  if (impact >= 3) return "bg-sky-300";
  if (impact >= 2) return "bg-sky-100";
  return "bg-slate-100";
}

export function StakeholderHeatmap({ initiatives, personas }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b bg-slate-50">
            <th className="px-3 py-2 text-left">Initiative</th>
            {personas.map((p) => (
              <th key={p.id} className="px-3 py-2 text-left">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {initiatives.map((initiative) => (
            <tr key={initiative.id} className="border-b">
              <td className="px-3 py-2 font-medium">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: initiative.domain?.color }} />
                  {initiative.title}
                </div>
              </td>
              {personas.map((persona) => {
                const hit = initiative.personaImpacts.find((i) => i.personaId === persona.id);
                const impact = hit?.impact ?? 0;
                return (
                  <td key={persona.id} className="px-3 py-2">
                    <span className={clsx("inline-flex min-w-8 items-center justify-center rounded px-2 py-1", colorByImpact(impact))}>
                      {impact}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
