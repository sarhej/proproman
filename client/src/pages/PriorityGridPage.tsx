import { PriorityGrid } from "../components/boards/PriorityGrid";
import type { Initiative } from "../types/models";

type Props = {
  initiatives: Initiative[];
  onOpen: (initiative: Initiative) => void;
};

export function PriorityGridPage({ initiatives, onOpen }: Props) {
  return <PriorityGrid initiatives={initiatives} onOpen={onOpen} />;
}
