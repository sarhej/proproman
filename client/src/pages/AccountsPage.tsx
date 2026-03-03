import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Account, Campaign, Demand, Initiative } from "../types/models";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Field";
import { Megaphone } from "lucide-react";

type AccountWithDemands = Account & {
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

export function AccountsPage({ isAdmin, onOpenInitiative, initiatives, quickFilter }: Props) {
  const [accounts, setAccounts] = useState<AccountWithDemands[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<Account["type"]>("B2B2C");
  const [selected, setSelected] = useState<string | null>(null);

  async function load() {
    const [acctResult, campResult] = await Promise.all([api.getAccounts(), api.getCampaigns()]);
    setAccounts(acctResult.accounts as AccountWithDemands[]);
    setCampaigns(campResult.campaigns);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const filteredAccounts = useMemo(() => {
    const q = quickFilter?.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => {
      const hay = [a.name, a.type, a.segment ?? "", a.dealStage ?? "", a.strategicTier ?? "", ...a.demands.map((d) => d.title)].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [quickFilter, accounts]);

  const detail = filteredAccounts.find((a) => a.id === selected) ?? (selected ? accounts.find((a) => a.id === selected) : undefined);

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
      <Card className="p-4">
        <h2 className="mb-1 text-lg font-semibold">Accounts</h2>
        <p className="mb-3 text-xs text-gray-500">
          Not a CRM — tracks account dependencies on products, assets, initiatives and requirements only.
        </p>
        {isAdmin ? (
          <div className="mb-3 grid grid-cols-1 gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name" />
            <Select value={type} onChange={(e) => setType(e.target.value as Account["type"])}>
              <option value="B2B2C">B2B2C</option>
              <option value="B2G2C">B2G2C</option>
              <option value="INSURER">Insurer</option>
              <option value="EMPLOYER">Employer</option>
              <option value="PUBLIC">Public</option>
            </Select>
            <Button
              onClick={async () => {
                if (!name.trim()) return;
                await api.createAccount({ name, type });
                setName("");
                await load();
              }}
            >
              Add
            </Button>
          </div>
        ) : null}
        <div className="grid gap-1">
          {filteredAccounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`rounded border px-3 py-2 text-left text-sm transition ${
                selected === a.id ? "border-sky-400 bg-sky-50" : "border-slate-200 hover:bg-slate-50"
              }`}
              onClick={() => setSelected(a.id)}
            >
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-slate-500">
                {a.type} {a.demands.length > 0 ? `- ${a.demands.length} demand${a.demands.length > 1 ? "s" : ""}` : ""}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        {detail ? (
          <div>
            <h3 className="mb-1 text-lg font-semibold">{detail.name}</h3>
            <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-500">
              <span>Type: {detail.type}</span>
              {detail.segment ? <span>Segment: {detail.segment}</span> : null}
              {detail.arrImpact ? <span>ARR: {detail.arrImpact.toLocaleString()}</span> : null}
              {detail.dealStage ? <span>Deal: {detail.dealStage}</span> : null}
              {detail.strategicTier ? <span>Tier: {detail.strategicTier}</span> : null}
            </div>

            <h4 className="mb-2 text-sm font-semibold">Demands ({detail.demands.length})</h4>
            {detail.demands.length === 0 ? (
              <p className="text-sm text-slate-400">No demands from this account.</p>
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
            {/* Marketing campaigns linked to this account */}
            {(() => {
              const linked = campaigns.filter((c) => c.links.some((l) => l.accountId === detail.id));
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
          <p className="py-8 text-center text-sm text-slate-400">Select an account to see details</p>
        )}
      </Card>
    </div>
  );
}
