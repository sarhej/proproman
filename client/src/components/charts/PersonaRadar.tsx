import { useTranslation } from "react-i18next";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Initiative, Persona } from "../../types/models";

type Props = {
  initiative: Initiative;
  personas: Persona[];
};

export function PersonaRadar({ initiative, personas }: Props) {
  const { t } = useTranslation();
  const data = personas.map((persona) => {
    const hit = initiative.personaImpacts?.find((p) => p.personaId === persona.id);
    return { persona: persona.name, impact: hit?.impact ?? 0 };
  });

  const hasAnyImpact = data.some((d) => d.impact > 0);
  const isEmpty = data.length === 0;

  if (isEmpty) {
    return (
      <div className="flex h-[220px] w-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
        <p className="text-sm text-slate-500">{t("initiative.personaRadarNoPersonas")}</p>
      </div>
    );
  }

  if (!hasAnyImpact) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">{t("initiative.personaRadarLegend")}</p>
        <div className="flex h-[180px] w-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
          <p className="text-sm text-slate-500">{t("initiative.personaRadarEmpty")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">{t("initiative.personaRadarLegend")}</p>
      <div className="h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey="persona" tick={{ fontSize: 11 }} />
            <PolarRadiusAxis type="number" domain={[0, 5]} />
            <Radar
              dataKey="impact"
              stroke="#0284c7"
              fill="#38bdf8"
              fillOpacity={0.55}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const value = payload[0].value as number;
                const name = payload[0].payload?.persona ?? "";
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
                    <p className="text-sm font-medium text-slate-800">{name}</p>
                    <p className="text-xs text-slate-500">{t("initiative.personaImpact")}: {value}/5</p>
                  </div>
                );
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
