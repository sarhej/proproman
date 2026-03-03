import type { Initiative, User } from "../../types/models";
import { InitiativeCard } from "../initiatives/InitiativeCard";
import { Card } from "../ui/Card";

type Props = {
  users: User[];
  initiatives: Initiative[];
  onOpen: (initiative: Initiative) => void;
};

export function OwnerBoard({ users, initiatives, onOpen }: Props) {
  return (
    <div className="grid gap-3">
      {users.map((user) => {
        const mine = initiatives.filter((i) => i.ownerId === user.id);
        if (!mine.length) return null;
        return (
          <Card key={user.id} className="p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">{user.name}</p>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{mine.length} items</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {mine.map((initiative) => (
                <InitiativeCard key={initiative.id} initiative={initiative} onClick={() => onOpen(initiative)} />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
