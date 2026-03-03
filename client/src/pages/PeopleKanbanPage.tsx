import { PeopleKanban } from "../components/boards/PeopleKanban";
import type { Initiative, User } from "../types/models";

type Props = {
  initiatives: Initiative[];
  users: User[];
  onOpen: (initiative: Initiative) => void;
  onReassign: (initiative: Initiative, userId: string | null) => Promise<void>;
};

export function PeopleKanbanPage({ initiatives, users, onOpen, onReassign }: Props) {
  return <PeopleKanban initiatives={initiatives} users={users} onOpen={onOpen} onReassign={onReassign} />;
}
