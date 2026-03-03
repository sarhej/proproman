import { OwnerBoard } from "../components/boards/OwnerBoard";
import type { Initiative, User } from "../types/models";

type Props = {
  users: User[];
  initiatives: Initiative[];
  onOpen: (initiative: Initiative) => void;
};

export function OwnerBoardPage({ users, initiatives, onOpen }: Props) {
  return <OwnerBoard users={users} initiatives={initiatives} onOpen={onOpen} />;
}
