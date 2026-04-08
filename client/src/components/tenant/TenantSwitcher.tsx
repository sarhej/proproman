import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, ChevronDown, Link2, Plus } from "lucide-react";
import { api } from "../../lib/api";
import { setWorkspaceTenantSessionForTab } from "../../lib/workspaceTenantHeader";
import { generateWorkspaceSlugFromTeamName } from "../../lib/workspaceRegistration";
import { copyWorkspaceEntryLink } from "../../lib/workspaceUrl";
import type { Tenant, TenantMembership, User } from "../../types/models";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

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
  currentUser: Pick<User, "name" | "email">;
  onSwitch: (tenant: Tenant) => void;
  compact?: boolean;
};

const SLUG_PATTERN = /^[a-z0-9-]+$/;

function normalizeUiLocale(i18nLanguage: string): string | undefined {
  const base = i18nLanguage.split("-")[0]?.toLowerCase() ?? "en";
  if (["en", "cs", "sk", "pl", "uk"].includes(base)) return base;
  return undefined;
}

function RequestWorkspaceModal({
  open,
  currentUser,
  onClose,
  onSubmitted,
  t,
  i18nLanguage,
}: {
  open: boolean;
  currentUser: Pick<User, "name" | "email">;
  onClose: () => void;
  onSubmitted: () => void;
  t: (key: string, opts?: Record<string, string>) => string;
  i18nLanguage: string;
}) {
  const [teamName, setTeamName] = useState("");
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitEmailMeta, setSubmitEmailMeta] = useState<{
    adminsNotifiedOnSubmit: boolean;
    decisionEmailsConfigured: boolean;
  }>({ adminsNotifiedOnSubmit: false, decisionEmailsConfigured: false });
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTeamName("");
    setSlug("");
    setMessage("");
    setError(null);
    setSuccess(false);
    setSubmitEmailMeta({ adminsNotifiedOnSubmit: false, decisionEmailsConfigured: false });
    setSubmitting(false);
    const id = window.requestAnimationFrame(() => nameInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const tn = teamName.trim();
    const sl = slug.trim();
    if (tn.length < 2) {
      setError(t("tenant.requestNewWorkspaceTeamNameInvalid"));
      return;
    }
    if (sl.length < 2 || !SLUG_PATTERN.test(sl)) {
      setError(t("tenant.requestNewWorkspaceSlugInvalid"));
      return;
    }
    setSubmitting(true);
    try {
      const locale = normalizeUiLocale(i18nLanguage);
      const res = await api.submitTenantRequest({
        teamName: tn,
        slug: sl,
        contactName: currentUser.name.trim(),
        contactEmail: currentUser.email.trim(),
        message: message.trim() || undefined,
        ...(locale ? { locale } : {}),
      });
      const n = res.emailNotifications;
      setSubmitEmailMeta({
        adminsNotifiedOnSubmit: n?.adminsNotifiedOnSubmit === true,
        decisionEmailsConfigured: n?.decisionEmailsConfigured === true,
      });
      setSuccess(true);
      onSubmitted();
    } catch (err) {
      const apiErr = err as Error & { status?: number; body?: { error?: string } };
      if (apiErr.status === 409) {
        setError(t("register.errorSlugTaken"));
      } else {
        setError(apiErr.body?.error ?? apiErr.message ?? t("register.errorGeneric"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const node = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="relative w-full max-w-md p-5 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label={t("tenant.requestNewWorkspaceClose")}
        >
          <span className="sr-only">{t("tenant.requestNewWorkspaceClose")}</span>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        {success ? (
          <div className="pr-8 text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
            </div>
            <h2 className="mb-2 text-lg font-semibold text-slate-800">{t("register.successTitle")}</h2>
            <div className="mb-6 space-y-2 text-sm text-slate-600">
              <p>{t("register.successLead")}</p>
              {submitEmailMeta.adminsNotifiedOnSubmit ? <p>{t("register.successAdminsEmailed")}</p> : null}
              {submitEmailMeta.decisionEmailsConfigured ? (
                <p>{t("register.successDecisionEmailPromise", { email: currentUser.email })}</p>
              ) : (
                <p>{t("register.successNoDecisionEmailPromise")}</p>
              )}
            </div>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("tenant.requestNewWorkspaceClose")}
            </Button>
          </div>
        ) : (
          <>
            <h2 className="mb-1 pr-8 text-lg font-semibold text-slate-800">{t("tenant.requestNewWorkspaceTitle")}</h2>
            <p className="mb-4 text-sm text-slate-500">{t("tenant.requestNewWorkspaceIntro")}</p>

            {error ? (
              <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            ) : null}

            <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium text-slate-700">{t("register.workspaceName")}</span>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  value={teamName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTeamName(v);
                    if (!slug || slug === generateWorkspaceSlugFromTeamName(teamName)) {
                      setSlug(generateWorkspaceSlugFromTeamName(v));
                    }
                  }}
                  placeholder={t("register.workspaceNamePlaceholder")}
                  className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-medium text-slate-700">{t("register.slug")}</span>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={50}
                  pattern="^[a-z0-9\-]+$"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder={t("register.slugPlaceholder")}
                  className="rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
                <span className="text-xs text-slate-400">{t("register.slugHelp")}</span>
              </label>

              <div className="rounded border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase text-slate-400">{t("tenant.requestNewWorkspaceContactLabel")}</p>
                <p className="text-sm text-slate-700">{`${currentUser.name} <${currentUser.email}>`}</p>
              </div>

              <label className="grid gap-1">
                <span className="text-sm font-medium text-slate-700">{t("register.message")}</span>
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("register.messagePlaceholder")}
                  className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
              </label>

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                  {t("tenant.requestNewWorkspaceCancel")}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t("register.submitting") : t("tenant.requestNewWorkspaceSubmit")}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(node, document.body) : null;
}

export function TenantSwitcher({ activeTenant, currentUser, onSwitch, compact }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
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
    async (slugStr: string) => {
      const ok = await copyWorkspaceEntryLink(slugStr);
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

  const loadTenants = useCallback(
    async (opts?: { force?: boolean }) => {
      if (loaded && !opts?.force) return;
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
    },
    [loaded]
  );

  const handleToggle = useCallback(() => {
    setOpen((o) => !o);
    if (!open) void loadTenants();
  }, [open, loadTenants]);

  const openRequestModal = useCallback(() => {
    setOpen(false);
    setRequestModalOpen(true);
  }, []);

  const handleRequestSubmitted = useCallback(() => {
    void loadTenants({ force: true });
  }, [loadTenants]);

  const handleSelect = useCallback(async (tenant: Tenant) => {
    setOpen(false);
    try {
      setWorkspaceTenantSessionForTab(tenant.id);
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

  const requestCtaButton = (
    <button
      type="button"
      onClick={openRequestModal}
      className="flex w-full items-center justify-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100"
    >
      <Plus size={16} className="shrink-0" aria-hidden />
      {t("tenant.requestNewWorkspace")}
    </button>
  );

  const compactRequestButton = (
    <button
      type="button"
      title={t("tenant.requestNewWorkspace")}
      aria-label={t("tenant.requestNewWorkspace")}
      onClick={openRequestModal}
      className="shrink-0 rounded p-1 text-sky-600 hover:bg-sky-50"
    >
      <Plus size={16} />
    </button>
  );

  const modal = (
    <RequestWorkspaceModal
      open={requestModalOpen}
      currentUser={currentUser}
      onClose={() => setRequestModalOpen(false)}
      onSubmitted={handleRequestSubmitted}
      t={t}
      i18nLanguage={i18n.language}
    />
  );

  // Single tenant and no pending applications — compact header row only
  if (loaded && memberships.length <= 1 && appliedWorkspaces.length === 0) {
    return (
      <>
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
          {compactRequestButton}
          {copyOk ? <span className="text-xs text-emerald-600">{t("tenant.entryLinkCopied")}</span> : null}
        </div>
        {modal}
      </>
    );
  }

  return (
    <>
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
            <div className="border-t border-slate-100 px-2 py-2">{requestCtaButton}</div>
            <p className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-400">{t("tenant.entryLinkHelp")}</p>
            {appliedWorkspaces.length > 0 ? (
              <p className="px-3 pb-2 text-[10px] text-slate-400">{t("tenant.switcherApplicationsHelp")}</p>
            ) : null}
          </div>
        )}
      </div>
      {modal}
    </>
  );
}
