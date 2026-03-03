import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Account, Demand, Initiative, Partner } from "../types/models";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Field";

type Props = {
  isAdmin: boolean;
  accounts: Account[];
  partners: Partner[];
  initiatives: Initiative[];
  onOpenInitiative?: (initiative: Initiative) => void;
  quickFilter?: string;
};

export function DemandsPage({ isAdmin, accounts, partners, initiatives, onOpenInitiative, quickFilter }: Props) {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<Demand["sourceType"]>("ACCOUNT");
  const [accountId, setAccountId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [initiativeId, setInitiativeId] = useState(initiatives[0]?.id ?? "");

  async function load() {
    const result = await api.getDemands();
    setDemands(result.demands);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const filteredDemands = useMemo(() => {
    const q = quickFilter?.trim().toLowerCase();
    if (!q) return demands;
    return demands.filter((d) => {
      const hay = [
        d.title,
        d.sourceType,
        d.status,
        d.account?.name ?? "",
        d.partner?.name ?? "",
        ...d.demandLinks.map((l) => l.initiative?.title ?? "")
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [quickFilter, demands]);

  const sourceSelector = useMemo(() => {
    if (sourceType === "ACCOUNT") {
      return (
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Select account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      );
    }
    if (sourceType === "PARTNER") {
      return (
        <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
          <option value="">Select partner</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      );
    }
    return <Input value="Internal/compliance" disabled />;
  }, [accounts, accountId, partnerId, partners, sourceType]);

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-lg font-semibold">Demands</h2>
      {isAdmin ? (
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-5">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Demand title" />
          <Select value={sourceType} onChange={(e) => setSourceType(e.target.value as Demand["sourceType"])}>
            <option value="ACCOUNT">Account</option>
            <option value="PARTNER">Partner</option>
            <option value="INTERNAL">Internal</option>
            <option value="COMPLIANCE">Compliance</option>
          </Select>
          {sourceSelector}
          <Select value={initiativeId} onChange={(e) => setInitiativeId(e.target.value)}>
            {initiatives.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </Select>
          <Button
            onClick={async () => {
              if (!title.trim()) return;
              await api.createDemand({
                title,
                sourceType,
                status: "NEW",
                urgency: 3,
                accountId: sourceType === "ACCOUNT" ? accountId || null : null,
                partnerId: sourceType === "PARTNER" ? partnerId || null : null,
                links: initiativeId ? [{ initiativeId }] : []
              });
              setTitle("");
              await load();
            }}
          >
            Add
          </Button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="px-2 py-2">Title</th>
              <th className="px-2 py-2">Source</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2 text-center">Urgency</th>
              <th className="px-2 py-2">Linked to</th>
            </tr>
          </thead>
          <tbody>
            {filteredDemands.map((d) => (
              <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-2 font-medium">{d.title}</td>
                <td className="px-2 py-2 text-xs text-slate-500">
                  {d.sourceType === "ACCOUNT" && d.account ? d.account.name : ""}
                  {d.sourceType === "PARTNER" && d.partner ? d.partner.name : ""}
                  {d.sourceType === "INTERNAL" ? "Internal" : ""}
                  {d.sourceType === "COMPLIANCE" ? "Compliance" : ""}
                </td>
                <td className="px-2 py-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    {d.status}
                  </span>
                </td>
                <td className="px-2 py-2 text-center">{d.urgency}</td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    {d.demandLinks.map((link) => {
                      const initiativeMatch =
                        link.initiative && initiatives.find((i) => i.id === link.initiative?.id);
                      return (
                        <span key={link.id} className="inline-flex items-center gap-1">
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
                    {d.demandLinks.length === 0 ? (
                      <span className="text-xs text-slate-400">Not linked</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
