import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import type { Campaign, Demand, DemandStatus, Initiative, Partner } from "../types/models";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Select, Textarea } from "../components/ui/Field";
import { Megaphone } from "lucide-react";

type PartnerWithDemands = Partner & {
  demands: (Demand & {
    demandLinks: Array<{
      initiative?: { id: string; title: string } | null;
      feature?: { id: string; title: string } | null;
    }>;
  })[];
};

type Props = {
  isAdmin: boolean;
  onOpenInitiative?: (initiative: Initiative) => void;
  initiatives?: Initiative[];
};

const DEMAND_STATUSES: DemandStatus[] = ["NEW", "VALIDATING", "APPROVED", "PLANNED", "SHIPPED", "REJECTED"];

function buildLinksPayload(
  demand: PartnerWithDemands["demands"][number],
  initiativeId: string
): { initiativeId: string | null; featureId: string | null }[] {
  const first = demand.demandLinks[0];
  if (initiativeId) {
    return [{ initiativeId, featureId: first?.featureId ?? null }];
  }
  if (first?.featureId) {
    return [{ initiativeId: null, featureId: first.featureId }];
  }
  return [];
}

function IntegrationDemandRow({
  demand,
  initiatives,
  isAdmin,
  onOpenInitiative,
  onSaved,
  onDeleted
}: {
  demand: PartnerWithDemands["demands"][number];
  initiatives: Initiative[];
  isAdmin: boolean;
  onOpenInitiative?: (initiative: Initiative) => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(demand.title);
  const [description, setDescription] = useState(demand.description ?? "");
  const [status, setStatus] = useState<DemandStatus>(demand.status);
  const [urgency, setUrgency] = useState(String(demand.urgency));
  const [initiativeId, setInitiativeId] = useState(demand.demandLinks[0]?.initiativeId ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(demand.title);
    setDescription(demand.description ?? "");
    setStatus(demand.status);
    setUrgency(String(demand.urgency));
    setInitiativeId(demand.demandLinks[0]?.initiativeId ?? "");
  }, [demand]);

  const firstLink = demand.demandLinks[0];
  const initiativeMatch =
    firstLink?.initiative && initiatives.find((i) => i.id === firstLink.initiative?.id);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.updateDemand(demand.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        urgency: Number(urgency),
        links: buildLinksPayload(demand, initiativeId)
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t("partners.deleteDemandConfirm"))) return;
    await api.deleteDemand(demand.id);
    onDeleted();
  };

  if (!isAdmin) {
    return (
      <div className="rounded border border-slate-200 p-2 text-sm">
        <div className="font-medium">{demand.title}</div>
        {demand.description ? <div className="mt-1 text-xs text-slate-600">{demand.description}</div> : null}
        <div className="text-xs text-slate-500">
          {demand.status} - {t("partners.urgency", { n: demand.urgency })}
        </div>
        {demand.demandLinks.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {demand.demandLinks.map((link, idx) => {
              const match = link.initiative && initiatives.find((i) => i.id === link.initiative?.id);
              return (
                <span key={idx} className="inline-flex items-center gap-1">
                  {match && onOpenInitiative ? (
                    <button
                      type="button"
                      className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 hover:bg-sky-200"
                      onClick={() => onOpenInitiative(match)}
                    >
                      {link.initiative?.title}
                    </button>
                  ) : (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                      {link.initiative?.title ?? t("common.unlinked")}
                    </span>
                  )}
                  {link.feature ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{link.feature.title}</span>
                  ) : null}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded border border-slate-200 p-3 text-sm">
      <div className="grid gap-2 md:grid-cols-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("demands.placeholder")} />
        <Select value={status} onChange={(e) => setStatus(e.target.value as DemandStatus)}>
          {DEMAND_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`demandStatus.${s}`)}
            </option>
          ))}
        </Select>
        <Select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {t("partners.urgency", { n })}
            </option>
          ))}
        </Select>
        <Select value={initiativeId} onChange={(e) => setInitiativeId(e.target.value)}>
          <option value="">{t("partners.initiativeOptional")}</option>
          {initiatives.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        className="mt-2"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("partners.demandDescriptionPlaceholder")}
      />
      {firstLink?.feature ? (
        <p className="mt-1 text-xs text-amber-800">
          {t("partners.featureLinkKept")}: {firstLink.feature.title}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" disabled={saving} onClick={() => void save()}>
          {saving ? "…" : t("common.save")}
        </Button>
        <Button type="button" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => void remove()}>
          {t("common.delete")}
        </Button>
        {initiativeMatch && onOpenInitiative ? (
          <Button type="button" variant="ghost" onClick={() => onOpenInitiative(initiativeMatch)}>
            {t("partners.openInitiative")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function PartnersPage({ isAdmin, onOpenInitiative, initiatives = [] }: Props) {
  const { t } = useTranslation();
  const [partners, setPartners] = useState<PartnerWithDemands[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState("");
  const [newDemandTitle, setNewDemandTitle] = useState("");
  const [newDemandDescription, setNewDemandDescription] = useState("");
  const [newDemandStatus, setNewDemandStatus] = useState<DemandStatus>("NEW");
  const [newDemandUrgency, setNewDemandUrgency] = useState("3");
  const [newDemandInitiativeId, setNewDemandInitiativeId] = useState("");

  const load = useCallback(async () => {
    const [partResult, campResult] = await Promise.all([api.getPartners(), api.getCampaigns()]);
    setPartners(partResult.partners as PartnerWithDemands[]);
    setCampaigns(campResult.campaigns);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    void load();
  }, [load]);

  const detail = selected ? partners.find((p) => p.id === selected) : undefined;

  useEffect(() => {
    if (detail) {
      setEditName(detail.name);
      setEditKind(detail.kind);
    }
  }, [detail?.id, detail?.name, detail?.kind]);

  const savePartner = async () => {
    if (!detail || !editName.trim() || !editKind.trim()) return;
    await api.updatePartner(detail.id, { name: editName.trim(), kind: editKind.trim() });
    await load();
  };

  const deletePartner = async () => {
    if (!detail) return;
    if (!window.confirm(t("partners.deleteIntegrationConfirm"))) return;
    await api.deletePartner(detail.id);
    setSelected(null);
    await load();
  };

  const addDemand = async () => {
    if (!detail || !newDemandTitle.trim()) return;
    await api.createDemand({
      title: newDemandTitle.trim(),
      description: newDemandDescription.trim() || null,
      sourceType: "PARTNER",
      status: newDemandStatus,
      urgency: Number(newDemandUrgency),
      partnerId: detail.id,
      accountId: null,
      links: newDemandInitiativeId ? [{ initiativeId: newDemandInitiativeId }] : []
    });
    setNewDemandTitle("");
    setNewDemandDescription("");
    setNewDemandStatus("NEW");
    setNewDemandUrgency("3");
    setNewDemandInitiativeId("");
    await load();
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
      <Card className="p-4">
        <h2 className="mb-1 text-lg font-semibold">{t("partners.title")}</h2>
        <p className="mb-3 text-xs text-gray-500">{t("partners.description")}</p>
        {isAdmin ? (
          <div className="mb-3 grid grid-cols-1 gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("partners.namePlaceholder")} />
            <Input value={kind} onChange={(e) => setKind(e.target.value)} placeholder={t("partners.kindPlaceholder")} />
            <Button
              onClick={async () => {
                if (!name.trim() || !kind.trim()) return;
                await api.createPartner({ name, kind });
                setName("");
                setKind("");
                await load();
              }}
            >
              {t("common.add")}
            </Button>
          </div>
        ) : null}
        <div className="grid gap-1">
          {partners.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`rounded border px-3 py-2 text-left text-sm transition ${
                selected === p.id ? "border-sky-400 bg-sky-50" : "border-slate-200 hover:bg-slate-50"
              }`}
              onClick={() => setSelected(p.id)}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-slate-500">
                {p.kind} {p.demands.length > 0 ? `- ${p.demands.length} demand${p.demands.length > 1 ? "s" : ""}` : ""}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        {detail ? (
          <div>
            {isAdmin ? (
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("partners.editIntegration")}</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t("partners.namePlaceholder")} />
                  <Input value={editKind} onChange={(e) => setEditKind(e.target.value)} placeholder={t("partners.kindPlaceholder")} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => void savePartner()}>
                    {t("common.save")}
                  </Button>
                  <Button type="button" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => void deletePartner()}>
                    {t("partners.deleteIntegration")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="mb-1 text-lg font-semibold">{detail.name}</h3>
                <div className="mb-3 text-xs text-slate-500">{detail.kind}</div>
              </>
            )}

            {isAdmin ? (
              <div className="mb-4 rounded-lg border border-dashed border-slate-300 p-3">
                <h4 className="mb-2 text-sm font-semibold">{t("partners.newDemandSection")}</h4>
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    value={newDemandTitle}
                    onChange={(e) => setNewDemandTitle(e.target.value)}
                    placeholder={t("demands.placeholder")}
                  />
                  <Select value={newDemandStatus} onChange={(e) => setNewDemandStatus(e.target.value as DemandStatus)}>
                    {DEMAND_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`demandStatus.${s}`)}
                      </option>
                    ))}
                  </Select>
                  <Select value={newDemandUrgency} onChange={(e) => setNewDemandUrgency(e.target.value)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={String(n)}>
                        {t("partners.urgency", { n })}
                      </option>
                    ))}
                  </Select>
                  <Select value={newDemandInitiativeId} onChange={(e) => setNewDemandInitiativeId(e.target.value)}>
                    <option value="">{t("partners.initiativeOptional")}</option>
                    {initiatives.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title}
                      </option>
                    ))}
                  </Select>
                </div>
                <Textarea
                  className="mt-2"
                  rows={2}
                  value={newDemandDescription}
                  onChange={(e) => setNewDemandDescription(e.target.value)}
                  placeholder={t("partners.demandDescriptionPlaceholder")}
                />
                <Button className="mt-2" type="button" onClick={() => void addDemand()}>
                  {t("partners.addDemandSubmit")}
                </Button>
              </div>
            ) : null}

            <h4 className="mb-2 text-sm font-semibold">{t("partners.demands", { count: detail.demands.length })}</h4>
            {detail.demands.length === 0 ? (
              <p className="text-sm text-slate-400">{t("partners.noDemands")}</p>
            ) : (
              <div className="grid gap-2">
                {detail.demands.map((demand) => (
                  <IntegrationDemandRow
                    key={demand.id}
                    demand={demand}
                    initiatives={initiatives}
                    isAdmin={isAdmin}
                    onOpenInitiative={onOpenInitiative}
                    onSaved={() => void load()}
                    onDeleted={() => void load()}
                  />
                ))}
              </div>
            )}
            {/* Marketing campaigns linked to this partner */}
            {(() => {
              const linked = campaigns.filter((c) => c.links.some((l) => l.partnerId === detail.id));
              return linked.length > 0 ? (
                <div className="mt-4">
                  <h4 className="mb-2 text-sm font-semibold">{t("partners.campaigns", { count: linked.length })}</h4>
                  <div className="grid gap-2">
                    {linked.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 rounded border border-slate-200 p-2 text-sm">
                        <Megaphone size={14} className="text-sky-500" />
                        <div>
                          <span className="font-medium">{c.name}</span>
                          <span
                            className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${c.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}
                          >
                            {t(`campaignStatus.${c.status}`)}
                          </span>
                          <div className="text-xs text-slate-500">
                            {t(`campaignType.${c.type}`)} · {t("campaigns.assets", { count: c.assets.length })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">{t("partners.selectPartner")}</p>
        )}
      </Card>
    </div>
  );
}
