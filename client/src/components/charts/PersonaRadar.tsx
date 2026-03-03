import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import type { Initiative, Persona } from "../../types/models";

type Props = {
  initiative: Initiative;
  personas: Persona[];
};

export function PersonaRadar({ initiative, personas }: Props) {
  const data = personas.map((persona) => {
    const hit = initiative.personaImpacts.find((p) => p.personaId === persona.id);
    return { persona: persona.name, impact: hit?.impact ?? 0 };
  });

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="persona" tick={{ fontSize: 11 }} />
          <Radar dataKey="impact" stroke="#0284c7" fill="#38bdf8" fillOpacity={0.55} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
