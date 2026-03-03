import { PriorityGrid } from "../components/boards/PriorityGrid";
import type { Initiative } from "../types/models";

type Props = {
  initiatives: Initiative[];
  onOpen: (initiative: Initiative) => void;
};

export function GapsPage({ initiatives, onOpen }: Props) {
  return <PriorityGrid initiatives={initiatives.filter((i) => i.isGap)} onOpen={onOpen} />;
}
