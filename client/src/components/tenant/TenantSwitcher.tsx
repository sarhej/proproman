import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, ChevronDown, Link2 } from "lucide-react";
import { api } from "../../lib/api";
import { copyWorkspaceEntryLink } from "../../lib/workspaceUrl";
import type { Tenant, TenantMembership } from "../../types/models";

type WorkspaceRegRow = {
  id: string;
  teamName: string;
  slug: string;
  status: string;
  createdAt: string;
  reviewNote: string | null;
};

type Props = {
  activeTenant: Tenant | null;
  onSwitch: (tenant: Tenant) => void;
  compact?: boolean;
};

export function TenantSwitcher({ activeTenant, onSwitch, compact }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [regRequests, setRegRequests] = useState<WorkspaceRegRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const memberSlugSet = useMemo(
    () => new Set(memberships.map((m) => m.tenant.slug.trim().toLowerCase())),
    [memberships]
  );

  /** Registration rows where the user is not yet a member (workspace applications). */
  const appliedWorkspaces = useMemo(
    () =>
      regRequests.filter(
        (r) =>
          !memberSlugSet.has(r.slug.trim().toLowerCase()) &&
          (r.status === "PENDING" || r.status === "APPROVED" || r.status === "REJECTED")
      ),
    [regRequests, memberSlugSet]
  );

  const flashCopy = useCallback(() => {
    setCopyOk(true);
    window.setTimeout(() => setCopyOk(false), 2000);
  }, []);

  const copyLink = useCallback(
    async (slug: string) => {
      const ok = await copyWorkspaceEntryLink(slug);
      if (ok) flashCopy();
    },
    [flashCopy]
  );

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const loadTenants = useCallback(async () => {
    if (loaded) return;
    let tenants: TenantMembership[] = [];
    try {
      const res = await api.getMyTenants();
      tenants = res.tenants;
    } catch {
      tenants = [];
    }
    let regs: WorkspaceRegRow[] = [];
    try {
      regs = (await api.getMyWorkspaceRegistrationRequests()).requests;
    } catch {
      regs = [];
    }
    setMemberships(tenants);
    setRegRequests(regs);
    setLoaded(true);
  }, [loaded]);

  const handleToggle = useCallback(() => {
    setOpen((o) => !o);
    if (!open) void loadTenants();
  }, [open, loadTenants]);

  const handleSelect = useCallback(async (tenant: Tenant) => {
    setOpen(false);
    try {
      await api.switchTenant(tenant.id);
      onSwitch(tenant);
    } catch {
      // ignore — user will see stale tenant
    }
  }, [onSwitch]);

  if (!activeTenant) return null;

  const regStatusLabel = (status: string) => {
    switch (status) {
      case "PENDING":
        return t("tenant.switcherStatusPending");
      case "APPROVED":
        return t("tenant.switcherStatusApproved");
      case "REJECTED":
        return t("tenant.switcherStatusRejected");
      default:
        return status;
    }
  };

  // Single tenant and no pending applications — compact header row only
  if (loaded && memberships.length <= 1 && appliedWorkspaces.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-slate-500">
        <Building2 size={14} className="text-slate-400" />
        <span className={compact ? "max-w-[100px] truncate" : ""}>{activeTenant.name}</span>
        <button
          type="button"
          title={t("tenant.copyEntryLink")}
          aria-label={t("tenant.copyEntryLink")}
          onClick={() => void copyLink(activeTenant.slug)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <Link2 size={14} />
        </button>
        {copyOk ? <span className="text-xs text-emerald-600">{t("tenant.entryLinkCopied")}</span> : null}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Building2 size={14} className="text-slate-400" />
        <span
          className={`flex min-w-0 items-center gap-1.5 ${compact ? "max-w-[100px]" : "max-w-[160px]"}`}
        >
          <span className="truncate">{activeTenant.name}</span>
          {activeTenant.isSystem ? (
            <span className="shrink-0 rounded bg-violet-100 px-1 py-0.5 text-[8px] font-semibold uppercase text-violet-700">
              {t("tenant.systemHubBadge")}
            </span>
          ) : null}
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <div className="px-3 py-2 text-xs font-semibold uppercase text-slate-400">
            {t("tenant.workspaces")}
          </div>
          {memberships.map((m) => (
            <div
              key={m.tenant.id}
              className={`flex items-center gap-0.5 px-1 py-0.5 ${
                m.tenant.id === activeTenant.id ? "bg-sky-50" : "hover:bg-slate-50"
              }`}
            >
              <button
                type="button"
                onClick={() => handleSelect(m.tenant)}
                className={`flex min-w-0 flex-1 items-center justify-between rounded px-2 py-2 text-left text-sm ${
                  m.tenant.id === activeTenant.id ? "text-sky-800" : "text-slate-700"
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                  <span className="truncate">{m.tenant.name}</span>
                  {m.tenant.isSystem ? (
                    <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700">
                      {t("tenant.systemHubBadge")}
                    </span>
                  ) : null}
                </span>
                <span className="ml-2 shrink-0 text-[10px] text-slate-400">{m.role}</span>
              </button>
              <button
                type="button"
                title={t("tenant.copyEntryLink")}
                aria-label={t("tenant.copyEntryLink")}
                onClick={() => void copyLink(m.tenant.slug)}
                className="shrink-0 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <Link2 size={14} />
              </button>
            </div>
          ))}
          {appliedWorkspaces.length > 0 ? (
            <>
              <div className="mt-1 border-t border-slate-100 px-3 py-2 text-xs font-semibold uppercase text-slate-400">
                {t("tenant.switcherApplications")}
              </div>
              {appliedWorkspaces.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-0.5 px-1 py-0.5 hover:bg-slate-50"
                >
                  <Link
                    to={`/t/${encodeURIComponent(r.slug)}`}
                    onClick={() => setOpen(false)}
                    className="flex min-w-0 flex-1 items-center justify-between rounded px-2 py-2 text-left text-sm text-slate-700"
                    title={t("tenant.switcherOpenWorkspacePage", { name: r.teamName })}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.teamName}</span>
                      <span className="font-mono text-[10px] text-slate-400">/t/{r.slug}</span>
                    </span>
                    <span
                      className={`ml-2 shrink-0 text-[10px] ${
                        r.status === "REJECTED" ? "text-amber-700" : "text-slate-400"
                      }`}
                    >
                      {regStatusLabel(r.status)}
                    </span>
                  </Link>
                  <button
                    type="button"
                    title={t("tenant.copyEntryLink")}
                    aria-label={t("tenant.copyEntryLink")}
                    onClick={(e) => {
                      e.preventDefault();
                      void copyLink(r.slug);
                    }}
                    className="shrink-0 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <Link2 size={14} />
                  </button>
                </div>
              ))}
            </>
          ) : null}
          <p className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-400">{t("tenant.entryLinkHelp")}</p>
          {appliedWorkspaces.length > 0 ? (
            <p className="px-3 pb-2 text-[10px] text-slate-400">{t("tenant.switcherApplicationsHelp")}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
