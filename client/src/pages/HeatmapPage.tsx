import { StakeholderHeatmap } from "../components/charts/StakeholderHeatmap";
import type { Initiative, Persona } from "../types/models";

type Props = {
  initiatives: Initiative[];
  personas: Persona[];
};

export function HeatmapPage({ initiatives, personas }: Props) {
  return <StakeholderHeatmap initiatives={initiatives} personas={personas} />;
}
