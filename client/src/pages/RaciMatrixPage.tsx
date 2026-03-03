import { RaciMatrix } from "../components/boards/RaciMatrix";
import type { Initiative, User } from "../types/models";

type Props = {
  initiatives: Initiative[];
  users: User[];
  readOnly: boolean;
  onOpen: (initiative: Initiative) => void;
  onChanged: () => void;
};

export function RaciMatrixPage({ initiatives, users, readOnly, onOpen, onChanged }: Props) {
  return (
    <RaciMatrix
      initiatives={initiatives}
      users={users}
      readOnly={readOnly}
      onOpen={onOpen}
      onChanged={onChanged}
    />
  );
}
