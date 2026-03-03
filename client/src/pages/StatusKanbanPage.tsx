import { StatusKanban } from "../components/boards/StatusKanban";
import type { Initiative, InitiativeStatus } from "../types/models";

type Props = {
  initiatives: Initiative[];
  onOpen: (initiative: Initiative) => void;
  onMove: (initiative: Initiative, nextStatus: InitiativeStatus) => Promise<void>;
};

export function StatusKanbanPage({ initiatives, onOpen, onMove }: Props) {
  return <StatusKanban initiatives={initiatives} onOpen={onOpen} onMove={onMove} />;
}
