import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Campaign, Demand, Initiative, Partner } from "../types/models";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Field";
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
  quickFilter?: string;
};

export function PartnersPage({ isAdmin, onOpenInitiative, initiatives, quickFilter }: Props) {
  const [partners, setPartners] = useState<PartnerWithDemands[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  async function load() {
    const [partResult, campResult] = await Promise.all([api.getPartners(), api.getCampaigns()]);
    setPartners(partResult.partners as PartnerWithDemands[]);
    setCampaigns(campResult.campaigns);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const filteredPartners = useMemo(() => {
    const q = quickFilter?.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter((p) => {
      const hay = [p.name, p.kind, ...p.demands.map((d) => d.title)].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [quickFilter, partners]);

  const detail = filteredPartners.find((p) => p.id === selected) ?? (selected ? partners.find((p) => p.id === selected) : undefined);

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
      <Card className="p-4">
        <h2 className="mb-1 text-lg font-semibold">Partners</h2>
        <p className="mb-3 text-xs text-gray-500">
          Not a partner management tool — tracks partner-driven feature demands and their link to initiatives.
        </p>
        {isAdmin ? (
          <div className="mb-3 grid grid-cols-1 gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Partner name" />
            <Input value={kind} onChange={(e) => setKind(e.target.value)} placeholder="Kind / capability" />
            <Button
              onClick={async () => {
                if (!name.trim() || !kind.trim()) return;
                await api.createPartner({ name, kind });
                setName("");
                setKind("");
                await load();
              }}
            >
              Add
            </Button>
          </div>
        ) : null}
        <div className="grid gap-1">
          {filteredPartners.map((p) => (
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
            <h3 className="mb-1 text-lg font-semibold">{detail.name}</h3>
            <div className="mb-3 text-xs text-slate-500">{detail.kind}</div>

            <h4 className="mb-2 text-sm font-semibold">Demands ({detail.demands.length})</h4>
            {detail.demands.length === 0 ? (
              <p className="text-sm text-slate-400">No demands from this partner.</p>
            ) : (
              <div className="grid gap-2">
                {detail.demands.map((demand) => (
                  <div key={demand.id} className="rounded border border-slate-200 p-2 text-sm">
                    <div className="font-medium">{demand.title}</div>
                    <div className="text-xs text-slate-500">
                      {demand.status} - urgency {demand.urgency}
                    </div>
                    {demand.demandLinks.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {demand.demandLinks.map((link, idx) => {
                          const initiativeMatch =
                            link.initiative && initiatives?.find((i) => i.id === link.initiative?.id);
                          return (
                            <span key={idx} className="inline-flex items-center gap-1">
                              {initiativeMatch && onOpenInitiative ? (
                                <button
                                  type="button"
                                  className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 hover:bg-sky-200"
                                  onClick={() => onOpenInitiative(initiativeMatch)}
                                >
                                  {link.initiative?.title}
                                </button>
                              ) : (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                                  {link.initiative?.title ?? "Unlinked"}
                                </span>
                              )}
                              {link.feature ? (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                                  {link.feature.title}
                                </span>
                              ) : null}
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {/* Marketing campaigns linked to this partner */}
            {(() => {
              const linked = campaigns.filter((c) => c.links.some((l) => l.partnerId === detail.id));
              return linked.length > 0 ? (
                <div className="mt-4">
                  <h4 className="mb-2 text-sm font-semibold">Campaigns ({linked.length})</h4>
                  <div className="grid gap-2">
                    {linked.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 rounded border border-slate-200 p-2 text-sm">
                        <Megaphone size={14} className="text-sky-500" />
                        <div>
                          <span className="font-medium">{c.name}</span>
                          <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${c.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                            {c.status}
                          </span>
                          <div className="text-xs text-slate-500">{c.type.replaceAll("_", " ")} · {c.assets.length} assets</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">Select a partner to see details</p>
        )}
      </Card>
    </div>
  );
}
