import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type {
  Campaign, CampaignStatus, CampaignType, AssetType, AssetStatus,
  Asset, Initiative, User, Account, Partner, Persona, CampaignLink
} from "../types/models";
import {
  ChevronDown, ChevronRight, Plus, Trash2, ExternalLink,
  FileText, Globe, Mail, Image, Video, Presentation, Share2, Megaphone, Link2
} from "lucide-react";
import { Button } from "../components/ui/Button";

type Props = {
  isAdmin: boolean;
  users: User[];
  accounts: Account[];
  partners: Partner[];
  personas: Persona[];
  initiatives: Initiative[];
  onOpenInitiative: (initiative: Initiative) => void;
  quickFilter?: string;
};

const CAMPAIGN_STATUSES: CampaignStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];
const CAMPAIGN_TYPES: CampaignType[] = ["PARTNER_COBRANDING", "PRODUCT_LAUNCH", "SEASONAL", "EVENT", "WEBINAR", "REFERRAL"];
const ASSET_TYPES: AssetType[] = ["LANDING_PAGE", "LEAFLET", "EMAIL_TEMPLATE", "BANNER", "VIDEO", "PRESENTATION", "SOCIAL_POST"];
const ASSET_STATUSES: AssetStatus[] = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"];

function statusColor(s: string): string {
  switch (s) {
    case "ACTIVE": case "PUBLISHED": return "bg-green-100 text-green-800";
    case "DRAFT": return "bg-slate-100 text-slate-600";
    case "IN_REVIEW": return "bg-amber-100 text-amber-800";
    case "APPROVED": case "COMPLETED": return "bg-blue-100 text-blue-800";
    case "PAUSED": case "ARCHIVED": return "bg-slate-200 text-slate-500";
    default: return "bg-slate-100 text-slate-600";
  }
}

function assetIcon(type: AssetType) {
  switch (type) {
    case "LANDING_PAGE": return Globe;
    case "LEAFLET": return FileText;
    case "EMAIL_TEMPLATE": return Mail;
    case "BANNER": return Image;
    case "VIDEO": return Video;
    case "PRESENTATION": return Presentation;
    case "SOCIAL_POST": return Share2;
    default: return FileText;
  }
}

function formatDate(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" });
}

function InlineAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (val: string) => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  if (!adding) {
    return (
      <button type="button" className="inline-flex items-center gap-1 text-[11px] text-sky-600 hover:text-sky-800" onClick={() => setAdding(true)}>
        <Plus size={12} /> {placeholder}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input autoFocus className="rounded border border-sky-300 px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-sky-400" placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter" && value.trim()) { await onAdd(value.trim()); setValue(""); setAdding(false); }
          if (e.key === "Escape") { setValue(""); setAdding(false); }
        }}
      />
      <button type="button" className="text-[10px] text-slate-400 hover:text-slate-600" onClick={() => { setValue(""); setAdding(false); }}>cancel</button>
    </span>
  );
}

function DeleteBtn({ label, onDelete }: { label: string; onDelete: () => Promise<void> }) {
  return (
    <button type="button" className="ml-1 inline-flex opacity-0 group-hover/row:opacity-100 text-slate-400 hover:text-red-500 transition-opacity" title={`Delete ${label}`}
      onClick={async (e) => { e.stopPropagation(); if (window.confirm(`Delete "${label}"?`)) await onDelete(); }}
    >
      <Trash2 size={12} />
    </button>
  );
}

function EditableTitle({ title, onSave, className }: { title: string; onSave: (v: string) => Promise<void>; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  if (!editing) return <span className={`cursor-text ${className ?? ""}`} onDoubleClick={() => setEditing(true)} title="Double-click to edit">{title}</span>;
  return (
    <input autoFocus className="rounded border border-sky-300 px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-sky-400" value={value} onChange={(e) => setValue(e.target.value)}
      onBlur={async () => { if (value.trim() && value.trim() !== title) await onSave(value.trim()); setEditing(false); }}
      onKeyDown={async (e) => { if (e.key === "Enter") { if (value.trim() && value.trim() !== title) await onSave(value.trim()); setEditing(false); } if (e.key === "Escape") { setValue(title); setEditing(false); } }}
    />
  );
}

function LinkBadge({ link, onOpenInitiative, onRemove, isAdmin }: { link: CampaignLink; onOpenInitiative: (i: Initiative) => void; onRemove: () => Promise<void>; isAdmin: boolean }) {
  return (
    <span className="group/link inline-flex items-center gap-0.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
      <Link2 size={10} />
      {link.initiative ? (
        <button type="button" className="hover:underline" onClick={() => onOpenInitiative(link.initiative as Initiative)}>{link.initiative.title}</button>
      ) : null}
      {link.account ? <span className="text-slate-500">{link.account.name}</span> : null}
      {link.partner ? <span className="text-emerald-700">{link.partner.name}</span> : null}
      {isAdmin ? (
        <button type="button" className="opacity-0 group-hover/link:opacity-100 text-red-400 hover:text-red-600" onClick={onRemove}>×</button>
      ) : null}
    </span>
  );
}

function AssetRow({ asset, isAdmin, onRefresh }: { asset: Asset; isAdmin: boolean; onRefresh: () => Promise<void> }) {
  const Icon = assetIcon(asset.type);
  return (
    <tr className="group/row border-t border-slate-100 text-xs hover:bg-slate-50">
      <td className="py-1.5 pl-12 pr-2">
        <Icon size={14} className="mr-1.5 inline text-slate-400" />
        {isAdmin ? (
          <EditableTitle title={asset.name} onSave={async (v) => { await api.updateAsset(asset.id, { name: v }); await onRefresh(); }} />
        ) : asset.name}
        {asset.url ? (
          <a href={asset.url} target="_blank" rel="noreferrer" className="ml-1 text-sky-500 hover:text-sky-700"><ExternalLink size={11} className="inline" /></a>
        ) : null}
        {isAdmin ? <DeleteBtn label={asset.name} onDelete={async () => { await api.deleteAsset(asset.id); await onRefresh(); }} /> : null}
      </td>
      <td className="px-2 text-center">
        {isAdmin ? (
          <select className="rounded border border-slate-200 px-1 py-0.5 text-[10px]" value={asset.type}
            onChange={async (e) => { await api.updateAsset(asset.id, { type: e.target.value }); await onRefresh(); }}>
            {ASSET_TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
          </select>
        ) : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{asset.type.replaceAll("_", " ")}</span>}
      </td>
      <td className="px-2 text-center text-[11px]">{asset.persona?.name ?? "-"}</td>
      <td className="px-2 text-center">
        {isAdmin ? (
          <select className="rounded border border-slate-200 px-1 py-0.5 text-[10px]" value={asset.status}
            onChange={async (e) => { await api.updateAsset(asset.id, { status: e.target.value }); await onRefresh(); }}>
            {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
          </select>
        ) : <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColor(asset.status)}`}>{asset.status.replaceAll("_", " ")}</span>}
      </td>
    </tr>
  );
}

function CampaignRow({
  campaign, isAdmin, users, accounts, partners, initiatives, onOpenInitiative, onRefresh
}: {
  campaign: Campaign; isAdmin: boolean; users: User[]; accounts: Account[]; partners: Partner[];
  initiatives: Initiative[]; onOpenInitiative: (i: Initiative) => void; onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [linkInit, setLinkInit] = useState("");
  const [linkAcct, setLinkAcct] = useState("");
  const [linkPartner, setLinkPartner] = useState("");

  return (
    <>
      <tr className="group/row border-t-2 border-slate-300 bg-slate-50 text-sm hover:bg-slate-100">
        <td className="py-2.5 pl-2 pr-2">
          <button type="button" className="mr-1 inline-flex items-center" onClick={() => setOpen(!open)}>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <Megaphone size={14} className="mr-1.5 inline text-sky-500" />
          {isAdmin ? (
            <EditableTitle title={campaign.name} className="font-semibold" onSave={async (v) => { await api.updateCampaign(campaign.id, { name: v }); await onRefresh(); }} />
          ) : <span className="font-semibold">{campaign.name}</span>}
          <span className="ml-2 text-xs font-normal text-slate-500">{campaign.assets.length} asset{campaign.assets.length !== 1 ? "s" : ""}</span>
          {isAdmin ? <DeleteBtn label={campaign.name} onDelete={async () => { await api.deleteCampaign(campaign.id); await onRefresh(); }} /> : null}
        </td>
        <td className="px-2 text-center">
          {isAdmin ? (
            <select className="rounded border border-slate-200 px-1 py-0.5 text-[10px]" value={campaign.type}
              onChange={async (e) => { await api.updateCampaign(campaign.id, { type: e.target.value }); await onRefresh(); }}>
              {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
            </select>
          ) : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{campaign.type.replaceAll("_", " ")}</span>}
        </td>
        <td className="px-2 text-center text-[11px]">
          {isAdmin ? (
            <select className="rounded border border-slate-200 px-1 py-0.5 text-[10px]" value={campaign.ownerId ?? ""}
              onChange={async (e) => { await api.updateCampaign(campaign.id, { ownerId: e.target.value || null }); await onRefresh(); }}>
              <option value="">— none —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          ) : campaign.owner?.name ?? "-"}
        </td>
        <td className="px-2 text-center">
          {isAdmin ? (
            <select className="rounded border border-slate-200 px-1 py-0.5 text-[10px]" value={campaign.status}
              onChange={async (e) => { await api.updateCampaign(campaign.id, { status: e.target.value }); await onRefresh(); }}>
              {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
            </select>
          ) : <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColor(campaign.status)}`}>{campaign.status.replaceAll("_", " ")}</span>}
        </td>
      </tr>

      {open ? (
        <>
          {/* Campaign metadata row */}
          <tr className="border-t border-slate-100 bg-white text-xs">
            <td colSpan={4} className="px-8 py-2">
              <div className="flex flex-wrap gap-4 text-slate-600">
                <span><strong>Dates:</strong> {formatDate(campaign.startDate)} – {formatDate(campaign.endDate)}</span>
                {campaign.budget ? <span><strong>Budget:</strong> {campaign.budget.toLocaleString("cs-CZ")} CZK</span> : null}
                {campaign.description ? <span className="text-slate-500">{campaign.description}</span> : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-semibold uppercase text-slate-400 mr-1">Linked:</span>
                {campaign.links.map((link) => (
                  <LinkBadge key={link.id} link={link} onOpenInitiative={onOpenInitiative} isAdmin={isAdmin}
                    onRemove={async () => { await api.deleteCampaignLink(link.id); await onRefresh(); }} />
                ))}
                {isAdmin ? (
                  addingLink ? (
                    <span className="inline-flex items-center gap-1 text-[10px]">
                      <select className="rounded border px-1 py-0.5" value={linkInit} onChange={(e) => setLinkInit(e.target.value)}>
                        <option value="">initiative…</option>
                        {initiatives.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
                      </select>
                      <select className="rounded border px-1 py-0.5" value={linkAcct} onChange={(e) => setLinkAcct(e.target.value)}>
                        <option value="">account…</option>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <select className="rounded border px-1 py-0.5" value={linkPartner} onChange={(e) => setLinkPartner(e.target.value)}>
                        <option value="">partner…</option>
                        {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <button type="button" className="rounded bg-sky-600 px-1.5 py-0.5 text-white hover:bg-sky-700" onClick={async () => {
                        if (!linkInit && !linkAcct && !linkPartner) return;
                        await api.createCampaignLink({ campaignId: campaign.id, initiativeId: linkInit || null, accountId: linkAcct || null, partnerId: linkPartner || null });
                        setLinkInit(""); setLinkAcct(""); setLinkPartner(""); setAddingLink(false); await onRefresh();
                      }}>Add</button>
                      <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setAddingLink(false)}>cancel</button>
                    </span>
                  ) : (
                    <button type="button" className="inline-flex items-center gap-0.5 text-[10px] text-sky-600 hover:text-sky-800" onClick={() => setAddingLink(true)}>
                      <Plus size={10} /> Link
                    </button>
                  )
                ) : null}
              </div>
            </td>
          </tr>

          {/* Asset header */}
          <tr className="border-t border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase text-slate-400">
            <th className="pl-12 pr-2 py-1">Asset</th>
            <th className="px-2 py-1 text-center">Type</th>
            <th className="px-2 py-1 text-center">Persona</th>
            <th className="px-2 py-1 text-center">Status</th>
          </tr>

          {campaign.assets.map((asset) => (
            <AssetRow key={asset.id} asset={asset} isAdmin={isAdmin} onRefresh={onRefresh} />
          ))}

          {isAdmin ? (
            <tr className="border-t border-slate-50 text-xs">
              <td className="py-1 pl-12 pr-2" colSpan={4}>
                <InlineAdd placeholder="Add asset" onAdd={async (name) => {
                  await api.createAsset({ campaignId: campaign.id, name, type: "LANDING_PAGE", status: "DRAFT" });
                  await onRefresh();
                }} />
              </td>
            </tr>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export function CampaignsPage({ isAdmin, users, accounts, partners, personas, initiatives, onOpenInitiative, quickFilter }: Props) {
  void personas; // available for future persona-based filtering
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");

  async function load() {
    const result = await api.getCampaigns();
    setCampaigns(result.campaigns);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const filtered = campaigns.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    const q = quickFilter?.trim().toLowerCase();
    if (q) {
      const hay = [c.name, c.description ?? "", c.owner?.name ?? "", c.type, c.status, ...c.assets.map((a) => a.name)].join(" ").toLowerCase();
      return hay.includes(q);
    }
    return true;
  });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1" />
        <select className="rounded border border-slate-200 px-2 py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
        </select>
        {isAdmin ? (
          <Button onClick={async () => {
            await api.createCampaign({ name: "New Campaign", type: "PRODUCT_LAUNCH", status: "DRAFT" });
            await load();
          }}>
            + New campaign
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[800px] text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100 text-xs font-semibold uppercase text-slate-500">
              <th className="px-2 py-2">Campaign</th>
              <th className="px-2 py-2 text-center">Type</th>
              <th className="px-2 py-2 text-center">Owner</th>
              <th className="px-2 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((campaign) => (
              <CampaignRow key={campaign.id} campaign={campaign} isAdmin={isAdmin} users={users}
                accounts={accounts} partners={partners} initiatives={initiatives}
                onOpenInitiative={onOpenInitiative} onRefresh={load} />
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                  No campaigns found. Create one to get started.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
