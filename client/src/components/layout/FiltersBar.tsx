import type { Domain, User } from "../../types/models";
import { Input, Label, Select } from "../ui/Field";

type Props = {
  domains: Domain[];
  users: User[];
  filters: {
    domainId?: string;
    ownerId?: string;
    priority?: string;
    horizon?: string;
    isGap?: boolean;
    quick?: string;
  };
  onChange: (patch: Partial<Props["filters"]>) => void;
};

export function FiltersBar({ domains, users, filters, onChange }: Props) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-6">
      <div>
        <Label>Domain</Label>
        <Select value={filters.domainId || ""} onChange={(e) => onChange({ domainId: e.target.value || undefined })}>
          <option value="">All</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Owner</Label>
        <Select value={filters.ownerId || ""} onChange={(e) => onChange({ ownerId: e.target.value || undefined })}>
          <option value="">All</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Priority</Label>
        <Select value={filters.priority || ""} onChange={(e) => onChange({ priority: e.target.value || undefined })}>
          <option value="">All</option>
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
        </Select>
      </div>
      <div>
        <Label>Horizon</Label>
        <Select value={filters.horizon || ""} onChange={(e) => onChange({ horizon: e.target.value || undefined })}>
          <option value="">All</option>
          <option value="NOW">Now</option>
          <option value="NEXT">Next</option>
          <option value="LATER">Later</option>
        </Select>
      </div>
      <div className="col-span-2">
        <Label>Quick filter</Label>
        <Input
          value={filters.quick || ""}
          placeholder="Search title, notes, owner, domain..."
          onChange={(e) => onChange({ quick: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
