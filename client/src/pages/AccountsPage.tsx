import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Account, Campaign, Demand, Initiative } from "../types/models";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Field";
import { Megaphone, Pencil } from "lucide-react";

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
};

export function AccountsPage({ isAdmin, onOpenInitiative, initiatives }: Props) {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<AccountWithDemands[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<Account["type"]>("B2B2C");
  const [selected, setSelected] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<Account["type"]>("B2B2C");

  async function load() {
    const [acctResult, campResult] = await Promise.all([api.getAccounts(), api.getCampaigns()]);
    setAccounts(acctResult.accounts as AccountWithDemands[]);
    setCampaigns(campResult.campaigns);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const detail = selected ? accounts.find((a) => a.id === selected) : undefined;

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
      <Card className="p-4">
        <h2 className="mb-1 text-lg font-semibold">{t("accounts.title")}</h2>
        <p className="mb-3 text-xs text-gray-500">
          {t("accounts.description")}
        </p>
        {isAdmin ? (
          <div className="mb-3 grid grid-cols-1 gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("accounts.placeholder")} />
            <Select value={type} onChange={(e) => setType(e.target.value as Account["type"])}>
              <option value="B2B2C">{t("accountType.B2B2C")}</option>
              <option value="B2G2C">{t("accountType.B2G2C")}</option>
              <option value="INSURER">{t("accountType.INSURER")}</option>
              <option value="EMPLOYER">{t("accountType.EMPLOYER")}</option>
              <option value="PUBLIC">{t("accountType.PUBLIC")}</option>
            </Select>
            <Button
              onClick={async () => {
                if (!name.trim()) return;
                await api.createAccount({ name, type });
                setName("");
                await load();
              }}
            >
              {t("common.add")}
            </Button>
          </div>
        ) : null}
        <div className="grid gap-1">
          {accounts.map((a) => (
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
            {editingId === detail.id ? (
              <div className="mb-3 space-y-2">
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t("accounts.placeholder")} />
                <Select value={editType} onChange={(e) => setEditType(e.target.value as Account["type"])}>
                  <option value="B2B2C">{t("accountType.B2B2C")}</option>
                  <option value="B2G2C">{t("accountType.B2G2C")}</option>
                  <option value="INSURER">{t("accountType.INSURER")}</option>
                  <option value="EMPLOYER">{t("accountType.EMPLOYER")}</option>
                  <option value="PUBLIC">{t("accountType.PUBLIC")}</option>
                </Select>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setEditingId(null)}>{t("common.cancel")}</Button>
                  <Button
                    onClick={async () => {
                      if (!editName.trim()) return;
                      await api.updateAccount(detail.id, { name: editName.trim(), type: editType });
                      setEditingId(null);
                      await load();
                    }}
                  >
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{detail.name}</h3>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(detail.id);
                        setEditName(detail.name);
                        setEditType(detail.type);
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      title={t("common.edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{t("accounts.type")} {t(`accountType.${detail.type}`)}</span>
                  {detail.segment ? <span>{t("accounts.segment")} {detail.segment}</span> : null}
                  {detail.arrImpact ? <span>{t("accounts.arr")} {detail.arrImpact.toLocaleString()}</span> : null}
                  {detail.dealStage ? <span>{t("accounts.deal")} {detail.dealStage}</span> : null}
                  {detail.strategicTier ? <span>{t("accounts.tier")} {detail.strategicTier}</span> : null}
                </div>
              </>
            )}

            <h4 className="mb-2 text-sm font-semibold">{t("accounts.demands", { count: detail.demands.length })}</h4>
            {detail.demands.length === 0 ? (
              <p className="text-sm text-slate-400">{t("accounts.noDemands")}</p>
            ) : (
              <div className="grid gap-2">
                {detail.demands.map((demand) => (
                  <div key={demand.id} className="rounded border border-slate-200 p-2 text-sm">
                    <div className="font-medium">{demand.title}</div>
                    <div className="text-xs text-slate-500">
                      {demand.status} - {t("accounts.urgency", { n: demand.urgency })}
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
                                  {link.initiative?.title ?? t("common.unlinked")}
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
                  <h4 className="mb-2 text-sm font-semibold">{t("accounts.campaigns", { count: linked.length })}</h4>
                  <div className="grid gap-2">
                    {linked.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 rounded border border-slate-200 p-2 text-sm">
                        <Megaphone size={14} className="text-sky-500" />
                        <div>
                          <Link to={`/campaigns?highlight=${c.id}`} className="font-medium text-sky-700 hover:text-sky-900 hover:underline">
                            {c.name}
                          </Link>
                          <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${c.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                            {t(`campaignStatus.${c.status}`)}
                          </span>
                          <div className="text-xs text-slate-500">{t(`campaignType.${c.type}`)} · {t("accounts.assets", { count: c.assets.length })}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">{t("accounts.selectAccount")}</p>
        )}
      </Card>
    </div>
  );
}
