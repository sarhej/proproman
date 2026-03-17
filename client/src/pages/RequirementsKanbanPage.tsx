import type { Initiative } from "../types/models";
import { RequirementsKanban } from "../components/boards/RequirementsKanban";

type Props = {
  initiatives: Initiative[];
  onMoveRequirement: (requirementId: string, isDone: boolean) => Promise<void>;
};

export function RequirementsKanbanPage({ initiatives, onMoveRequirement }: Props) {
  return (
    <RequirementsKanban initiatives={initiatives} onMoveRequirement={onMoveRequirement} />
  );
}
