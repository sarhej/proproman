import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  CommercialType,
  DateConfidence,
  DealStage,
  Domain,
  Horizon,
  Initiative,
  InitiativeStatus,
  Persona,
  Priority,
  Product,
  RevenueStream,
  StrategicTier,
  User
} from "../../types/models";
import { formatPriority } from "../../lib/format";
import { Button } from "../ui/Button";
import { Input, Label, Select, Textarea } from "../ui/Field";

type FormValue = {
  title: string;
  productId: string;
  description: string;
  problemStatement: string;
  successCriteria: string;
  domainId: string;
  ownerId: string;
  priority: Priority;
  horizon: Horizon;
  status: InitiativeStatus;
  commercialType: CommercialType;
  isGap: boolean;
  startDate: string;
  targetDate: string;
  milestoneDate: string;
  dateConfidence: DateConfidence;
  arrImpact: string;
  renewalDate: string;
  dealStage: DealStage;
  strategicTier: StrategicTier;
  notes: string;
  personaImpacts: Record<string, number>;
  revenueWeights: Record<string, number>;
};

type Props = {
  initiative?: Initiative;
  products: Product[];
  domains: Domain[];
  users: User[];
  personas: Persona[];
  revenueStreams: RevenueStream[];
  currentUserId?: string | null;
  readOnly: boolean;
  onSubmit: (value: unknown) => Promise<void>;
  onDelete?: () => Promise<void>;
  onArchive?: () => Promise<void>;
  onUnarchive?: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  /** When true, the form does not render its own Save button (e.g. when Save is in the panel header). */
  hideSaveButton?: boolean;
};

export type InitiativeFormHandle = {
  save: () => Promise<void>;
};

function toInitial(
  initiative: Initiative | undefined,
  products: Product[],
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
    productId: initiative?.productId ?? products[0]?.id ?? "",
    description: initiative?.description ?? "",
    problemStatement: initiative?.problemStatement ?? "",
    successCriteria: initiative?.successCriteria ?? "",
    domainId: initiative?.domainId ?? domains[0]?.id ?? "",
    ownerId: initiative?.ownerId ?? "",
    priority: initiative?.priority ?? "P1",
    horizon: initiative?.horizon ?? "NEXT",
    status: initiative?.status ?? "IDEA",
    commercialType: initiative?.commercialType ?? "CARE_QUALITY",
    isGap: initiative?.isGap ?? false,
    startDate: initiative?.startDate ? initiative.startDate.slice(0, 10) : "",
    targetDate: initiative?.targetDate ? initiative.targetDate.slice(0, 10) : "",
    milestoneDate: initiative?.milestoneDate ? initiative.milestoneDate.slice(0, 10) : "",
    dateConfidence: initiative?.dateConfidence ?? "MEDIUM",
    arrImpact: initiative?.arrImpact != null ? String(initiative.arrImpact) : "",
    renewalDate: initiative?.renewalDate ? initiative.renewalDate.slice(0, 10) : "",
    dealStage: initiative?.dealStage ?? "ACTIVE",
    strategicTier: initiative?.strategicTier ?? "TIER_2",
    notes: initiative?.notes ?? "",
    personaImpacts,
    revenueWeights
  };
}

export const InitiativeForm = forwardRef<InitiativeFormHandle, Props>(function InitiativeForm({
  initiative,
  products,
  domains,
  users,
  personas,
  revenueStreams,
  currentUserId = null,
  onSubmit,
  onDelete,
  onArchive,
  onUnarchive,
  onDirtyChange,
  readOnly,
  hideSaveButton = false
}, ref) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormValue>(() => toInitial(initiative, products, domains, personas, revenueStreams));
  const [saving, setSaving] = useState(false);
  const initialRef = useRef<string>(JSON.stringify(toInitial(initiative, products, domains, personas, revenueStreams)));

  const canSubmit = useMemo(() => form.title.trim().length > 0 && form.domainId, [form.domainId, form.title]);

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(form) !== initialRef.current);
  }, [form, onDirtyChange]);

  async function handleSave() {
    if (!canSubmit || readOnly) return;
    setSaving(true);
    try {
      await onSubmit({
        title: form.title,
        productId: form.productId || null,
        description: form.description || null,
        problemStatement: form.problemStatement || null,
        successCriteria: form.successCriteria || null,
        domainId: form.domainId,
        ownerId: form.ownerId || null,
        priority: form.priority,
        horizon: form.horizon,
        status: form.status,
        commercialType: form.commercialType,
        isGap: form.isGap,
        startDate: form.startDate ? `${form.startDate}T00:00:00.000Z` : null,
        targetDate: form.targetDate ? `${form.targetDate}T00:00:00.000Z` : null,
        milestoneDate: form.milestoneDate ? `${form.milestoneDate}T00:00:00.000Z` : null,
        dateConfidence: form.dateConfidence,
        arrImpact: form.arrImpact ? Number(form.arrImpact) : null,
        renewalDate: form.renewalDate ? `${form.renewalDate}T00:00:00.000Z` : null,
        dealStage: form.dealStage,
        strategicTier: form.strategicTier,
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

  useImperativeHandle(ref, () => ({ save: handleSave }));

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>{t("initiative.title")}</Label>
          <Input
            className="text-lg font-semibold"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            disabled={readOnly}
          />
        </div>
        <div className="md:col-span-2">
          <Label>{t("initiative.description")}</Label>
          <Textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            disabled={readOnly}
          />
        </div>
        <div className="md:col-span-2 rounded-md border border-blue-200 bg-blue-50/50 p-3">
          <Label>{t("initiative.problemStatement")}</Label>
          <Textarea
            rows={2}
            value={form.problemStatement}
            onChange={(e) => setForm((prev) => ({ ...prev, problemStatement: e.target.value }))}
            disabled={readOnly}
          />
        </div>
        <div className="md:col-span-2 rounded-md border border-blue-200 bg-blue-50/50 p-3">
          <Label>{t("initiative.successCriteria")}</Label>
          <Textarea
            rows={2}
            value={form.successCriteria}
            onChange={(e) => setForm((prev) => ({ ...prev, successCriteria: e.target.value }))}
            disabled={readOnly}
          />
        </div>
        <div>
          <Label>{t("initiative.product")}</Label>
          <Select value={form.productId} onChange={(e) => setForm((prev) => ({ ...prev, productId: e.target.value }))} disabled={readOnly}>
            <option value="">{t("initiative.noProduct")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("initiative.domain")}</Label>
          <div className="relative">
            {form.domainId && (
              <span
                className="pointer-events-none absolute left-2.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                style={{ background: domains.find((d) => d.id === form.domainId)?.color }}
              />
            )}
            <Select
              value={form.domainId}
              onChange={(e) => setForm((prev) => ({ ...prev, domainId: e.target.value }))}
              disabled={readOnly}
              className={form.domainId ? "pl-7" : ""}
            >
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label>{t("initiative.owner")}</Label>
          <Select value={form.ownerId} onChange={(e) => setForm((prev) => ({ ...prev, ownerId: e.target.value }))} disabled={readOnly}>
            <option value="">{t("common.unassigned")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("initiative.priority")}</Label>
          <Select value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as Priority }))} disabled={readOnly}>
            {["P0", "P1", "P2", "P3"].map((p) => (
              <option key={p} value={p}>
                {formatPriority(p as Priority)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("initiative.horizon")}</Label>
          <Select value={form.horizon} onChange={(e) => setForm((prev) => ({ ...prev, horizon: e.target.value as Horizon }))} disabled={readOnly}>
            <option value="NOW">{t("horizon.NOW")}</option>
            <option value="NEXT">{t("horizon.NEXT")}</option>
            <option value="LATER">{t("horizon.LATER")}</option>
          </Select>
        </div>
        <div>
          <Label>{t("initiative.status")}</Label>
          <Select
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as InitiativeStatus }))}
            disabled={readOnly}
          >
            {(["IDEA", "PLANNED", "IN_PROGRESS", "DONE", "BLOCKED"] as const).map((s) => (
              <option key={s} value={s}>{t(`status.${s}`)}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("initiative.commercial")}</Label>
          <Select
            value={form.commercialType}
            onChange={(e) => setForm((prev) => ({ ...prev, commercialType: e.target.value as CommercialType }))}
            disabled={readOnly}
          >
            {(["CONTRACT_ENABLER", "CHURN_PREVENTER", "UPSELL_DRIVER", "COMPLIANCE_GATE", "CARE_QUALITY", "COST_REDUCER"] as const).map((c) => (
              <option key={c} value={c}>
                {t(`commercialType.${c}`)}
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
          <span className="text-sm">{t("initiative.markGap")}</span>
        </div>
        <div className="md:col-span-2">
          <Label>{t("initiative.notes")}</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} disabled={readOnly} />
        </div>
        <div>
          <Label>{t("initiative.startDate")}</Label>
          <Input type="date" value={form.startDate} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} disabled={readOnly} />
        </div>
        <div>
          <Label>{t("initiative.targetDate")}</Label>
          <Input type="date" value={form.targetDate} onChange={(e) => setForm((prev) => ({ ...prev, targetDate: e.target.value }))} disabled={readOnly} />
        </div>
        <div>
          <Label>{t("initiative.milestoneDate")}</Label>
          <Input
            type="date"
            value={form.milestoneDate}
            onChange={(e) => setForm((prev) => ({ ...prev, milestoneDate: e.target.value }))}
            disabled={readOnly}
          />
        </div>
        <div>
          <Label>{t("initiative.arrImpact")}</Label>
          <Input value={form.arrImpact} onChange={(e) => setForm((prev) => ({ ...prev, arrImpact: e.target.value }))} disabled={readOnly} />
        </div>
        <div>
          <Label>{t("initiative.renewalDate")}</Label>
          <Input
            type="date"
            value={form.renewalDate}
            onChange={(e) => setForm((prev) => ({ ...prev, renewalDate: e.target.value }))}
            disabled={readOnly}
          />
        </div>
        <div>
          <Label>{t("initiative.dealStage")}</Label>
          <Select value={form.dealStage} onChange={(e) => setForm((prev) => ({ ...prev, dealStage: e.target.value as DealStage }))} disabled={readOnly}>
            {(["DISCOVERY", "PILOT", "CONTRACTING", "ACTIVE", "RENEWAL"] as const).map((s) => (
              <option key={s} value={s}>{t(`dealStage.${s}`)}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t("initiative.strategicTier")}</Label>
          <Select
            value={form.strategicTier}
            onChange={(e) => setForm((prev) => ({ ...prev, strategicTier: e.target.value as StrategicTier }))}
            disabled={readOnly}
          >
            {(["TIER_1", "TIER_2", "TIER_3"] as const).map((tier) => (
              <option key={tier} value={tier}>{t(`strategicTier.${tier}`)}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold">{t("initiative.personaImpact")}</p>
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
        <p className="mb-2 text-sm font-semibold">{t("initiative.revenueAttribution")}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {revenueStreams.map((r) => (
            <div key={r.id}>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                {r.name}
              </label>
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
          {initiative && !readOnly && (onArchive || onUnarchive) ? (
            initiative.archivedAt ? (
              onUnarchive ? (
                <Button variant="secondary" onClick={onUnarchive}>
                  {t("common.unarchive")}
                </Button>
              ) : null
            ) : onArchive ? (
              <Button variant="secondary" onClick={onArchive}>
                {t("common.archive")}
              </Button>
            ) : null
          ) : initiative && onDelete && !readOnly ? (
            <Button variant="danger" onClick={onDelete}>
              {t("common.delete")}
            </Button>
          ) : null}
        </div>
        {!hideSaveButton ? (
          <Button onClick={handleSave} disabled={!canSubmit || saving || readOnly}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        ) : null}
      </div>
    </div>
  );
});
