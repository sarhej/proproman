import { PeopleKanban } from "../components/boards/PeopleKanban";
import type { Initiative, User } from "../types/models";

type Props = {
  initiatives: Initiative[];
  users: User[];
  onOpen: (initiative: Initiative) => void;
  onReassignAccountable: (initiative: Initiative, userId: string | null) => Promise<void>;
};

export function PeopleKanbanPage({ initiatives, users, onOpen, onReassignAccountable }: Props) {
  return <PeopleKanban initiatives={initiatives} users={users} onOpen={onOpen} onReassignAccountable={onReassignAccountable} />;
}
