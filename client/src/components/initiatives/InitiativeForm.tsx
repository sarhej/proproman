import { useMemo, useState } from "react";
import type { CommercialType, Domain, Horizon, Initiative, InitiativeStatus, Persona, Priority, RevenueStream, User } from "../../types/models";
import { Button } from "../ui/Button";
import { Input, Label, Select, Textarea } from "../ui/Field";

type FormValue = {
  title: string;
  description: string;
  domainId: string;
  ownerId: string;
  priority: Priority;
  horizon: Horizon;
  status: InitiativeStatus;
  commercialType: CommercialType;
  isGap: boolean;
  notes: string;
  personaImpacts: Record<string, number>;
  revenueWeights: Record<string, number>;
};

type Props = {
  initiative?: Initiative;
  domains: Domain[];
  users: User[];
  personas: Persona[];
  revenueStreams: RevenueStream[];
  readOnly: boolean;
  onSubmit: (value: unknown) => Promise<void>;
  onDelete?: () => Promise<void>;
};

function toInitial(
  initiative: Initiative | undefined,
  domains: Domain[],
  personas: Persona[],
  revenueStreams: RevenueStream[]
): FormValue {
  const personaImpacts = Object.fromEntries(personas.map((p) => [p.id, 3]));
  const revenueWeights = Object.fromEntries(revenueStreams.map((r) => [r.id, 25]));
  if (initiative) {
    initiative.personaImpacts.forEach((p) => {
      personaImpacts[p.personaId] = p.impact;
    });
    initiative.revenueWeights.forEach((r) => {
      revenueWeights[r.revenueStreamId] = r.weight;
    });
  }

  return {
    title: initiative?.title ?? "",
    description: initiative?.description ?? "",
    domainId: initiative?.domainId ?? domains[0]?.id ?? "",
    ownerId: initiative?.ownerId ?? "",
    priority: initiative?.priority ?? "P1",
    horizon: initiative?.horizon ?? "NEXT",
    status: initiative?.status ?? "IDEA",
    commercialType: initiative?.commercialType ?? "CARE_QUALITY",
    isGap: initiative?.isGap ?? false,
    notes: initiative?.notes ?? "",
    personaImpacts,
    revenueWeights
  };
}

export function InitiativeForm({
  initiative,
  domains,
  users,
  personas,
  revenueStreams,
  onSubmit,
  onDelete,
  readOnly
}: Props) {
  const [form, setForm] = useState<FormValue>(() => toInitial(initiative, domains, personas, revenueStreams));
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(() => form.title.trim().length > 0 && form.domainId, [form.domainId, form.title]);

  async function handleSave() {
    if (!canSubmit || readOnly) return;
    setSaving(true);
    try {
      await onSubmit({
        title: form.title,
        description: form.description || null,
        domainId: form.domainId,
        ownerId: form.ownerId || null,
        priority: form.priority,
        horizon: form.horizon,
        status: form.status,
        commercialType: form.commercialType,
        isGap: form.isGap,
        notes: form.notes || null,
        personaImpacts: personas.map((p) => ({ personaId: p.id, impact: Number(form.personaImpacts[p.id] ?? 3) })),
        revenueWeights: revenueStreams.map((r) => ({
          revenueStreamId: r.id,
          weight: Number(form.revenueWeights[r.id] ?? 0)
        }))
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Title</Label>
          <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} disabled={readOnly} />
        </div>
        <div className="md:col-span-2">
          <Label>Description</Label>
          <Textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            disabled={readOnly}
          />
        </div>
        <div>
          <Label>Domain</Label>
          <Select value={form.domainId} onChange={(e) => setForm((prev) => ({ ...prev, domainId: e.target.value }))} disabled={readOnly}>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Owner</Label>
          <Select value={form.ownerId} onChange={(e) => setForm((prev) => ({ ...prev, ownerId: e.target.value }))} disabled={readOnly}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as Priority }))} disabled={readOnly}>
            {["P0", "P1", "P2", "P3"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Horizon</Label>
          <Select value={form.horizon} onChange={(e) => setForm((prev) => ({ ...prev, horizon: e.target.value as Horizon }))} disabled={readOnly}>
            <option value="NOW">Now</option>
            <option value="NEXT">Next</option>
            <option value="LATER">Later</option>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as InitiativeStatus }))}
            disabled={readOnly}
          >
            <option value="IDEA">Idea</option>
            <option value="PLANNED">Planned</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="DONE">Done</option>
            <option value="BLOCKED">Blocked</option>
          </Select>
        </div>
        <div>
          <Label>Commercial Type</Label>
          <Select
            value={form.commercialType}
            onChange={(e) => setForm((prev) => ({ ...prev, commercialType: e.target.value as CommercialType }))}
            disabled={readOnly}
          >
            {[
              "CONTRACT_ENABLER",
              "CHURN_PREVENTER",
              "UPSELL_DRIVER",
              "COMPLIANCE_GATE",
              "CARE_QUALITY",
              "COST_REDUCER"
            ].map((c) => (
              <option key={c} value={c}>
                {c.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isGap}
            onChange={(e) => setForm((prev) => ({ ...prev, isGap: e.target.checked }))}
            disabled={readOnly}
          />
          <span className="text-sm">Mark as gap item</span>
        </div>
        <div className="md:col-span-2">
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} disabled={readOnly} />
        </div>
      </div>

      <div className="rounded-md border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold">Persona impact (1-5)</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {personas.map((p) => (
            <div key={p.id}>
              <Label>{p.name}</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.personaImpacts[p.id]}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    personaImpacts: { ...prev.personaImpacts, [p.id]: Number(e.target.value || 3) }
                  }))
                }
                disabled={readOnly}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold">Revenue attribution (%)</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {revenueStreams.map((r) => (
            <div key={r.id}>
              <Label>{r.name}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.revenueWeights[r.id]}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    revenueWeights: { ...prev.revenueWeights, [r.id]: Number(e.target.value || 0) }
                  }))
                }
                disabled={readOnly}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          {initiative && onDelete && !readOnly ? (
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          ) : null}
        </div>
        <Button onClick={handleSave} disabled={!canSubmit || saving || readOnly}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
