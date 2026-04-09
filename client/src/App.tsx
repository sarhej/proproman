import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PublicLanguageSwitcher } from "./components/i18n/PublicLanguageSwitcher";
import { AppShell } from "./components/layout/AppShell";
import { FiltersBar } from "./components/layout/FiltersBar";
import { InitiativeDetailPanel } from "./components/initiatives/InitiativeDetailPanel";
import { InitiativeForm } from "./components/initiatives/InitiativeForm";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { ViewRoute } from "./components/ViewRoute";
import { useAuth } from "./hooks/useAuth";
import { useBoardData } from "./hooks/useBoardData";
import { useWorkspaceHubEvents } from "./hooks/useWorkspaceHubEvents";
import { usePermissions } from "./hooks/usePermissions";
import { useUiSettings } from "./hooks/useUiSettings";
import { api } from "./lib/api";
import { TenantPicker } from "./components/tenant/TenantPicker";
import { DomainBoardPage } from "./pages/DomainBoardPage";
import { PriorityGridPage } from "./pages/PriorityGridPage";
import { RaciMatrixPage } from "./pages/RaciMatrixPage";
import { HeatmapPage } from "./pages/HeatmapPage";
import { BuyerUserPage } from "./pages/BuyerUserPage";
import { GapsPage } from "./pages/GapsPage";
import { StatusKanbanPage } from "./pages/StatusKanbanPage";
import { PeopleKanbanPage } from "./pages/PeopleKanbanPage";
import { ProductExplorerPage } from "./pages/ProductExplorerPage";
import { AccountsPage } from "./pages/AccountsPage";
import { DemandsPage } from "./pages/DemandsPage";
import { PartnersPage } from "./pages/PartnersPage";
import { CalendarPage } from "./pages/CalendarPage";
import { GanttPage } from "./pages/GanttPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { AdminPage } from "./pages/AdminPage";
import { AgentSetupPage } from "./pages/AgentSetupPage";
import { KpiDashboardPage } from "./pages/KpiDashboardPage";
import { MilestonesTimelinePage } from "./pages/MilestonesTimelinePage";
import { FeatureDetailPage } from "./pages/FeatureDetailPage";
import { RequirementDetailPage } from "./pages/RequirementDetailPage";
import { ExecutionBoardPage } from "./pages/ExecutionBoardPage";
import { BoardSettingsPage } from "./pages/BoardSettingsPage";
import { RequirementsKanbanPage } from "./pages/RequirementsKanbanPage";
import { LegalFooterLinks } from "./components/legal/LegalFooterLinks";
import { LandingPage } from "./pages/LandingPage";
import { WorkspaceSettingsPage } from "./pages/WorkspaceSettingsPage";
import { RegisterTeamPage } from "./pages/RegisterTeamPage";
import { PlatformPendingPage } from "./pages/PlatformPendingPage";
import { TenantSlugLoginPage } from "./pages/TenantSlugLoginPage";
import { TenantWorkspaceNoAccessPage } from "./pages/TenantWorkspaceNoAccessPage";
import type { Initiative, Tenant, UserRole } from "./types/models";
import { getRoleCode } from "./types/models";
import {
  POST_AUTH_WORKSPACE_SLUG_KEY,
  clearPostAuthWorkspaceSlugIfSlugPath,
  hasPostAuthWorkspaceSlugPendingOnRoot,
} from "./lib/postAuthWorkspaceSlug";
import {
  clearWorkspaceTenantSession,
  getWorkspaceTenantIdForApi,
  setWorkspaceTenantSessionForTab,
} from "./lib/workspaceTenantHeader";
import { APP_LOCALE_CODES, canManageWorkspaceLanguages, normalizeUiLanguageCode } from "./lib/appLocales";
import type { HubChangeEventPayload } from "./lib/hubChangeEvent";
import { WikiIndexPage } from "./pages/wiki/WikiIndexPage";
import { WikiArticlePage } from "./pages/wiki/WikiArticlePage";
import { resetDocumentSeoDefaults, SeoHead } from "./components/seo/SeoHead";

const DEV_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "EDITOR", "MARKETING", "VIEWER"];

function App() {
  const { t, i18n } = useTranslation();
  const { user, activeTenant, loading: authLoading, error: authError, refresh: refreshAuth } = useAuth();
  const [needsTenantPick, setNeedsTenantPick] = useState(false);
  const [slugRegistrationHint, setSlugRegistrationHint] = useState<{
    kind: "PENDING" | "APPROVED_NO_ACCESS";
    slug: string;
    teamName: string;
  } | null>(null);
  const [pendingUserWorkspaceRegs, setPendingUserWorkspaceRegs] = useState<
    Array<{ id: string; teamName: string; slug: string; status: string }>
  >([]);
  const [workspaceSlugGate, setWorkspaceSlugGate] = useState<
    | { state: "idle" }
    | { state: "checking" }
    | { state: "no_membership"; name: string; slug: string }
  >({ state: "idle" });

  const location = useLocation();
  const navigate = useNavigate();
  const tenantSlug = useMemo(() => {
    const m = location.pathname.match(/^\/t\/([^/]+)/);
    return m ? m[1] : null;
  }, [location.pathname]);

  const blockWorkspaceSlugGate =
    Boolean(tenantSlug) &&
    Boolean(user) &&
    !authLoading &&
    (workspaceSlugGate.state === "checking" || workspaceSlugGate.state === "no_membership");

  /** PENDING users are not allowed past requireAuth on tenant-scoped APIs — do not load board/meta/initiatives. */
  const boardDataEnabled =
    !!user &&
    user.role !== "PENDING" &&
    !needsTenantPick &&
    !blockWorkspaceSlugGate;

  const hubRefreshSuppressedRef = useRef(false);
  const initiativeFormDirtyRef = useRef(false);
  const [hubRemoteChangePending, setHubRemoteChangePending] = useState(false);
  const board = useBoardData(boardDataEnabled, { hubRefreshSuppressedRef });
  const perms = usePermissions(user);
  const uiSettings = useUiSettings(
    !!user && user.role !== "PENDING",
    `${activeTenant?.id ?? ""}|${getWorkspaceTenantIdForApi() ?? ""}`
  );

  const shellLocales = useMemo(() => {
    const allowed = activeTenant?.enabledLocales;
    if (!allowed?.length) return [...APP_LOCALE_CODES];
    const set = new Set(allowed);
    return APP_LOCALE_CODES.filter((c) => set.has(c));
  }, [activeTenant?.enabledLocales]);

  const canManageWorkspaceStructure = useMemo(
    () => (user ? canManageWorkspaceLanguages(user.role, activeTenant) : false),
    [user, activeTenant]
  );

  useEffect(() => {
    if (!user || !activeTenant) return;
    const cur = normalizeUiLanguageCode(i18n.language);
    if (!shellLocales.includes(cur)) {
      const fallback = shellLocales[0] ?? "en";
      void i18n.changeLanguage(fallback);
      try {
        localStorage.setItem("lang", fallback);
      } catch {
        /* ignore */
      }
    }
  }, [user?.id, activeTenant?.id, shellLocales, i18n]);
  const [selected, setSelected] = useState<Initiative | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [landingView, setLandingView] = useState<"landing" | "signin">("landing");
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSending, setMagicSending] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [magicErr, setMagicErr] = useState<string | null>(null);
  const [devLoginLoading, setDevLoginLoading] = useState(false);
  const [devLoginError, setDevLoginError] = useState<string | null>(null);
  const [devRole, setDevRole] = useState<UserRole>("SUPER_ADMIN");
  const [devTenants, setDevTenants] = useState<Tenant[]>([]);
  const [devTenantId, setDevTenantId] = useState<string>("");
  const showDevLogin = import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";

  const handleMagicLinkSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setMagicErr(null);
      const em = magicEmail.trim();
      if (!em) return;
      setMagicSending(true);
      try {
        await api.requestMagicLink(em);
        setMagicSent(true);
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        if (status === 503) {
          setMagicErr(t("app.magicLinkUnavailable"));
        } else {
          setMagicErr(t("app.magicLinkError"));
        }
      } finally {
        setMagicSending(false);
      }
    },
    [magicEmail, t]
  );

  const loadDevTenants = useCallback(async () => {
    if (!showDevLogin) return;
    try {
      const { tenants } = await api.getDevTenants();
      setDevTenants(tenants);
      if (tenants.length > 0 && !devTenantId) setDevTenantId(tenants[0].id);
    } catch { /* ignore */ }
  }, [showDevLogin, devTenantId]);

  useEffect(() => { void loadDevTenants(); }, [loadDevTenants]);

  const [searchParams, setSearchParams] = useSearchParams();
  const hideFilters =
    location.pathname === "/gantt" ||
    location.pathname.startsWith("/features/") ||
    location.pathname.startsWith("/requirements/") ||
    location.pathname.includes("/execution-board") ||
    location.pathname.includes("/board-settings") ||
    location.pathname.startsWith("/admin") ||
    location.pathname === "/workspace-settings" ||
    location.pathname === "/partners" ||
    location.pathname === "/buyer-user" ||
    location.pathname === "/accounts" ||
    location.pathname === "/demands";

  const selectedFresh = useMemo(
    () => board.initiatives.find((i) => i.id === selected?.id) || selected,
    [board.initiatives, selected]
  );

  const handleHubEvent = useCallback(
    (e: HubChangeEventPayload) => {
      const openId = selected?.id;
      const sameInitiative = (id: string | null | undefined) => id != null && id === openId;
      const affectsOpen =
        openId &&
        ((e.entityType === "INITIATIVE" &&
          (sameInitiative(e.entityId) || e.operation === "REORDER")) ||
          (e.entityType === "FEATURE" && sameInitiative(e.initiativeId)) ||
          (e.entityType === "REQUIREMENT" && sameInitiative(e.initiativeId)));

      if (!openId || !affectsOpen) {
        void board.refreshSilent();
        return;
      }
      if (initiativeFormDirtyRef.current) {
        setHubRemoteChangePending(true);
        return;
      }
      void board.refreshSilent();
    },
    [board, selected?.id]
  );

  useWorkspaceHubEvents({
    enabled: boardDataEnabled && Boolean(activeTenant?.id),
    onEvent: handleHubEvent
  });

  useEffect(() => {
    setHubRemoteChangePending(false);
  }, [selected?.id]);

  useEffect(() => {
    const initiativeId = searchParams.get("initiative");
    if (initiativeId && board.initiatives.length > 0 && !selected) {
      const found = board.initiatives.find((i) => i.id === initiativeId);
      if (found) {
        setSelected(found);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, board.initiatives, selected, setSearchParams]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setShowCreate(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (user?.role !== "PENDING") return;
    let cancelled = false;
    void api
      .getMyWorkspaceRegistrationRequests()
      .then((r) => {
        if (!cancelled) setPendingUserWorkspaceRegs(r.requests);
      })
      .catch(() => {
        if (!cancelled) setPendingUserWorkspaceRegs([]);
      });
    return () => { cancelled = true; };
  }, [user?.role, user?.id]);

  useLayoutEffect(() => {
    if (!user || authLoading) return;
    clearPostAuthWorkspaceSlugIfSlugPath(location.pathname);
    if (location.pathname !== "/") return;
    try {
      const slug = sessionStorage.getItem(POST_AUTH_WORKSPACE_SLUG_KEY)?.trim();
      if (slug) {
        navigate(`/t/${encodeURIComponent(slug)}`, { replace: true });
      }
    } catch {
      /* ignore */
    }
  }, [user?.id, authLoading, location.pathname, navigate]);

  useLayoutEffect(() => {
    if (!tenantSlug || !user || authLoading) {
      setWorkspaceSlugGate({ state: "idle" });
      return;
    }
    try {
      const stored = sessionStorage.getItem(POST_AUTH_WORKSPACE_SLUG_KEY)?.trim();
      if (stored && stored.toLowerCase() === tenantSlug.trim().toLowerCase()) {
        sessionStorage.removeItem(POST_AUTH_WORKSPACE_SLUG_KEY);
      }
    } catch {
      /* ignore */
    }
    setWorkspaceSlugGate((prev) => {
      if (
        prev.state === "no_membership" &&
        prev.slug.toLowerCase() === tenantSlug.trim().toLowerCase()
      ) {
        return prev;
      }
      return { state: "checking" };
    });
  }, [tenantSlug, user?.id, authLoading]);

  useEffect(() => {
    if (workspaceSlugGate.state !== "checking" || !tenantSlug || !user || authLoading) return;
    let cancelled = false;
    const slugNorm = tenantSlug.trim().toLowerCase();
    const slugForApi = tenantSlug.trim();
    const authenticatedUser = user;

    async function run() {
      if (authenticatedUser.role !== "PENDING") {
        try {
          const myTenants = await api.getMyTenants();
          if (cancelled) return;
          const match = myTenants.tenants.find((m) => m.tenant.slug.toLowerCase() === slugNorm);
          if (match) {
            setWorkspaceTenantSessionForTab(match.tenant.id);
            await api.switchTenant(match.tenant.id);
            if (!cancelled) {
              await refreshAuth();
              setWorkspaceSlugGate({ state: "idle" });
              navigate("/", { replace: true });
            }
            return;
          }
        } catch {
          /* e.g. transient /me/tenants failure — still resolve slug via public API */
        }
      }

      try {
        const info = await api.getTenantBySlug(slugForApi);
        if (!cancelled) {
          setWorkspaceSlugGate({
            state: "no_membership",
            name: info.name,
            slug: info.slug,
          });
        }
        return;
      } catch {
        /* workspace not ACTIVE / not found — fall through */
      }

      try {
        const regs = await api.getMyWorkspaceRegistrationRequests();
        if (cancelled) return;
        const forSlug = regs.requests.filter((r) => r.slug.toLowerCase() === slugNorm);
        const pending = forSlug.find((r) => r.status === "PENDING");
        if (pending) {
          setSlugRegistrationHint({ kind: "PENDING", slug: pending.slug, teamName: pending.teamName });
        } else if (authenticatedUser.role !== "PENDING") {
          const appr = forSlug.find((r) => r.status === "APPROVED");
          if (appr) {
            setSlugRegistrationHint({
              kind: "APPROVED_NO_ACCESS",
              slug: appr.slug,
              teamName: appr.teamName,
            });
          }
        }
      } catch {
        /* ignore */
      }

      if (!cancelled) {
        setWorkspaceSlugGate({ state: "idle" });
        navigate("/", { replace: true });
      }
    }

    void run();
    return () => { cancelled = true; };
  }, [workspaceSlugGate.state, tenantSlug, user?.id, user?.role, authLoading, navigate, refreshAuth]);

  const isWikiPath = location.pathname === "/wiki" || location.pathname.startsWith("/wiki/");

  useEffect(() => {
    if (authLoading) return;
    if (isWikiPath) return;
    if (!user || user.role === "PENDING") return;
    resetDocumentSeoDefaults();
  }, [authLoading, isWikiPath, user?.id, user?.role]);

  if (isWikiPath) {
    return (
      <>
        <PublicLanguageSwitcher />
        <Routes>
          <Route path="/wiki" element={<WikiIndexPage />} />
          <Route path="/wiki/:slug" element={<WikiArticlePage />} />
        </Routes>
      </>
    );
  }

  if (authLoading) {
    return (
      <>
        <PublicLanguageSwitcher />
        <div className="p-8">{t("app.loadingAuth")}</div>
      </>
    );
  }

  if (!user) {
    if (tenantSlug) {
      return (
        <>
          <PublicLanguageSwitcher />
          <TenantSlugLoginPage
            workspaceSlug={tenantSlug}
            onAuthenticated={() => window.location.reload()}
          />
        </>
      );
    }

    return (
      <>
        <PublicLanguageSwitcher />
        <Routes>
          <Route path="/register-workspace" element={<RegisterTeamPage onBack={() => navigate("/")} />} />
          <Route
            path="/"
            element={
              landingView === "landing" && !searchParams.get("error") && !authError ? (
                <LandingPage
                  onSignIn={() => setLandingView("signin")}
                  onRegister={() => navigate("/register-workspace")}
                />
              ) : (
                <>
                  <SeoHead
                    title={t("seo.signInTitle")}
                    description={t("seo.signInDescription")}
                    canonicalPath="/"
                  />
                  <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                    <Card className="max-w-md p-6">
                      <div className="mb-4 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setLandingView("landing")}
                          className="mr-1 inline-flex items-center text-slate-400 hover:text-slate-600"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                          </svg>
                        </button>
                        <img src="/logo.svg" alt="Tymio" className="h-8" />
                        <span className="text-lg font-semibold text-slate-500">{t("app.brand")}</span>
                      </div>
                      <p className="mb-4 text-sm text-slate-600">{t("app.signInDesc")}</p>
                      {(authError || searchParams.get("error") === "login_failed" || searchParams.get("error") === "login_denied") ? (
                        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="auth-error">
                          {searchParams.get("error") === "login_denied"
                            ? t("app.loginDenied")
                            : searchParams.get("error") === "login_failed"
                              ? t("app.loginFailed")
                              : authError}
                        </p>
                      ) : null}
                      <div className="grid gap-2">
                        <Button onClick={() => (window.location.href = `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/auth/google`)}>
                          {t("app.continueGoogle")}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => (window.location.href = `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/auth/microsoft`)}
                        >
                          {t("app.continueMicrosoft")}
                        </Button>
                        <p className="mt-3 text-center text-xs text-slate-400">{t("app.emailSignInDivider")}</p>
                        {magicSent ? (
                          <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" data-testid="magic-link-sent">
                            {t("app.magicLinkSent")}
                          </p>
                        ) : (
                          <form onSubmit={(e) => void handleMagicLinkSubmit(e)} className="grid gap-2">
                            <input
                              type="email"
                              autoComplete="email"
                              name="email"
                              value={magicEmail}
                              onChange={(e) => setMagicEmail(e.target.value)}
                              placeholder={t("app.emailPlaceholder")}
                              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
                            />
                            <Button type="submit" variant="secondary" disabled={magicSending}>
                              {magicSending ? "…" : t("app.sendMagicLink")}
                            </Button>
                            {magicErr ? (
                              <p className="text-sm text-red-600" data-testid="magic-link-err">
                                {magicErr}
                              </p>
                            ) : null}
                          </form>
                        )}
                        {showDevLogin ? (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Developer Login</p>
                            <div className="grid gap-2">
                              <div className="grid grid-cols-2 gap-2">
                                <label className="grid gap-1">
                                  <span className="text-xs text-slate-500">Role</span>
                                  <select
                                    value={devRole}
                                    onChange={(e) => setDevRole(e.target.value as UserRole)}
                                    className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
                                  >
                                    {DEV_ROLES.map((r) => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="grid gap-1">
                                  <span className="text-xs text-slate-500">Workspace</span>
                                  <select
                                    value={devTenantId}
                                    onChange={(e) => setDevTenantId(e.target.value)}
                                    className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
                                  >
                                    {devTenants.length === 0 && <option value="">Loading...</option>}
                                    {devTenants.map((tn) => (
                                      <option key={tn.id} value={tn.id}>{tn.name}</option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <Button
                                variant="secondary"
                                disabled={devLoginLoading || !devTenantId}
                                onClick={async () => {
                                  try {
                                    setDevLoginLoading(true);
                                    setDevLoginError(null);
                                    await api.devLogin(devRole, devTenantId || undefined);
                                    window.location.reload();
                                  } catch (error) {
                                    setDevLoginError((error as Error).message);
                                  } finally {
                                    setDevLoginLoading(false);
                                  }
                                }}
                              >
                                {devLoginLoading ? "Signing in..." : `Dev Login as ${devRole}`}
                              </Button>
                            </div>
                            {devLoginError ? <p className="mt-1 text-xs text-red-600">{devLoginError}</p> : null}
                          </div>
                        ) : null}
                      </div>
                      <LegalFooterLinks className="mt-6 text-center text-xs text-slate-400" />
                    </Card>
                  </div>
                </>
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </>
    );
  }

  if (hasPostAuthWorkspaceSlugPendingOnRoot(location.pathname)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p className="text-sm text-slate-500">{t("app.resolvingWorkspaceLink")}</p>
      </div>
    );
  }

  if (tenantSlug && workspaceSlugGate.state === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p className="text-sm text-slate-500">{t("app.resolvingWorkspaceLink")}</p>
      </div>
    );
  }

  if (tenantSlug && workspaceSlugGate.state === "no_membership") {
    return (
      <TenantWorkspaceNoAccessPage
        workspaceName={workspaceSlugGate.name}
        workspaceSlug={workspaceSlugGate.slug}
        userEmail={user.email}
        isPlatformPending={user.role === "PENDING"}
        onContinue={() => {
          navigate("/", { replace: true });
        }}
      />
    );
  }

  if (user.role === "PENDING") {
    return (
      <>
        <PublicLanguageSwitcher />
        <Routes>
          <Route
            path="/register-workspace"
            element={
              <RegisterTeamPage
                onBack={() => navigate("/")}
                prefilledContact={{ email: user.email, name: user.name ?? "" }}
                backLabelKey="app.pendingBackToSetup"
                onWorkspaceProvisioned={async (slug) => {
                  await refreshAuth();
                  navigate(`/t/${encodeURIComponent(slug)}`, { replace: true });
                }}
              />
            }
          />
          <Route
            path="*"
            element={
              <PlatformPendingPage
                userEmail={user.email}
                slugRegistrationHint={slugRegistrationHint}
                pendingUserWorkspaceRegs={pendingUserWorkspaceRegs}
                onSignOut={async () => {
                  await api.logout();
                  window.location.reload();
                }}
                onNavigateToWorkspace={(slug) => {
                  navigate(`/t/${encodeURIComponent(slug)}`);
                }}
                onRequestNewWorkspace={() => navigate("/register-workspace")}
              />
            }
          />
        </Routes>
      </>
    );
  }

  if (needsTenantPick || (!activeTenant && !authLoading && user)) {
    return (
      <TenantPicker
        onSelected={async () => {
          setNeedsTenantPick(false);
          await refreshAuth();
          window.location.reload();
        }}
      />
    );
  }

  if (!board.meta) {
    return <div className="p-8">{t("app.loadingData")}</div>;
  }

  async function refreshAndClose() {
    await board.refresh();
  }

  return (
    <AppShell
      user={user}
      permissions={perms}
      hiddenNavPaths={uiSettings.hiddenNavPaths}
      activeTenant={activeTenant}
      localePickerCodes={shellLocales}
      canManageWorkspaceStructure={canManageWorkspaceStructure}
      onTenantSwitch={() => setNeedsTenantPick(true)}
      onNewInitiative={perms.canCreate ? () => setShowCreate(true) : undefined}
      onLogout={async () => {
        clearWorkspaceTenantSession();
        await api.logout();
        window.location.reload();
      }}
      onExport={() => {
        window.open(`${import.meta.env.VITE_API_BASE_URL ?? ""}/api/export/initiatives.csv`, "_blank");
      }}
      onExportPdf={() => {
        window.print();
      }}
    >
      {slugRegistrationHint ? (
        <div
          className="mb-3 flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          data-print-hide
        >
          <p>
            {slugRegistrationHint.kind === "PENDING"
              ? t("tenant.slugRegBannerPending", {
                  slug: slugRegistrationHint.slug,
                  workspaceName: slugRegistrationHint.teamName,
                })
              : t("tenant.slugRegBannerApprovedNoAccess", {
                  slug: slugRegistrationHint.slug,
                  workspaceName: slugRegistrationHint.teamName,
                })}
          </p>
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-amber-800 underline"
            onClick={() => setSlugRegistrationHint(null)}
          >
            {t("tenant.dismiss")}
          </button>
        </div>
      ) : null}
      {!hideFilters && (
        <div data-print-hide>
          <FiltersBar
            domains={board.meta.domains}
            users={board.meta.users}
            labelSuggestions={board.meta.labelSuggestions}
            filters={board.filters}
            onChange={(patch) => board.setFilters((prev) => ({ ...prev, ...patch }))}
          />
        </div>
      )}
      {board.error ? <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{board.error}</div> : null}
      {board.loading ? (
        <div className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-600">{t("app.loadingInitiatives")}</div>
      ) : (
        <Routes>
            <Route
            path="/"
            element={
              <ViewRoute user={user} path="/" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <DomainBoardPage
                  domains={board.meta.domains}
                  initiatives={board.initiatives}
                  onOpen={(i) => setSelected(i)}
                  onReorder={async (next) => {
                    board.setInitiatives(next);
                    await api.reorderInitiatives(next.map((item) => ({ id: item.id, domainId: item.domainId, sortOrder: item.sortOrder })));
                    await board.refresh();
                  }}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/priority"
            element={
              <ViewRoute user={user} path="/priority" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <PriorityGridPage initiatives={board.initiatives} onOpen={(i) => setSelected(i)} />
              </ViewRoute>
            }
          />
          <Route
            path="/raci"
            element={
              <ViewRoute user={user} path="/raci" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <RaciMatrixPage
                  initiatives={board.initiatives}
                  users={board.meta.users}
                  readOnly={!perms.canEditStructure}
                  onOpen={(i) => setSelected(i)}
                  onChanged={() => board.refresh()}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/status-kanban"
            element={
              <ViewRoute user={user} path="/status-kanban" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <StatusKanbanPage
                  initiatives={board.initiatives}
                  onOpen={(i) => setSelected(i)}
                  onMove={async (initiative, nextStatus) => {
                    await api.updateInitiative(initiative.id, { status: nextStatus });
                    await board.refresh();
                  }}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/accountability"
            element={
              <ViewRoute user={user} path="/accountability" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <PeopleKanbanPage
                  initiatives={board.initiatives}
                  users={board.meta.users}
                  onOpen={(i) => setSelected(i)}
                  onReassignAccountable={async (initiative, userId) => {
                    const oldAccountable = initiative.assignments.find((a) => a.role === "ACCOUNTABLE");
                    if (oldAccountable) {
                      await api.removeAssignment({
                        initiativeId: initiative.id,
                        userId: oldAccountable.userId,
                        role: "ACCOUNTABLE"
                      });
                    }
                    if (userId) {
                      await api.addAssignment({
                        initiativeId: initiative.id,
                        userId,
                        role: "ACCOUNTABLE"
                      });
                    }
                    await board.refresh();
                  }}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/kpi-dashboard"
            element={
              <ViewRoute user={user} path="/kpi-dashboard" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <KpiDashboardPage
                  domains={board.meta.domains}
                  users={board.meta.users}
                  initiatives={board.initiatives}
                  onOpenInitiative={(i) => setSelected(i)}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/heatmap"
            element={
              <ViewRoute user={user} path="/heatmap" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <HeatmapPage initiatives={board.initiatives} personas={board.meta.personas} />
              </ViewRoute>
            }
          />
          <Route
            path="/buyer-user"
            element={
              <ViewRoute user={user} path="/buyer-user" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <BuyerUserPage initiatives={board.initiatives} onOpen={(i) => setSelected(i)} />
              </ViewRoute>
            }
          />
          <Route
            path="/gaps"
            element={
              <ViewRoute user={user} path="/gaps" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <GapsPage initiatives={board.initiatives} onOpen={(i) => setSelected(i)} />
              </ViewRoute>
            }
          />
          <Route
            path="/product-explorer"
            element={
              <ViewRoute user={user} path="/product-explorer" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <ProductExplorerPage
                  isAdmin={perms.canEditStructure}
                  canCreateInitiative={perms.canEditContent}
                  currentUserId={user?.id ?? null}
                  onOpenInitiative={(i) => setSelected(i)}
                  quickFilter={board.filters.quick}
                  boardFilters={board.filters}
                  onExplorerHubLockChange={(locked) => {
                    hubRefreshSuppressedRef.current = locked;
                  }}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/workspace-settings"
            element={
              <ViewRoute
                user={user}
                path="/workspace-settings"
                hiddenNavPaths={uiSettings.hiddenNavPaths}
                ignoreHide={canManageWorkspaceStructure}
              >
                <WorkspaceSettingsPage
                  user={user}
                  activeTenant={activeTenant}
                  onSaved={() => {
                    void refreshAuth();
                    void uiSettings.refresh();
                  }}
                  onNavViewsSaved={() => void uiSettings.refresh()}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/accounts"
            element={
              <ViewRoute user={user} path="/accounts" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <AccountsPage isAdmin={perms.canEditStructure} onOpenInitiative={(i) => setSelected(i)} initiatives={board.initiatives} />
              </ViewRoute>
            }
          />
          <Route
            path="/demands"
            element={
              <ViewRoute user={user} path="/demands" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <DemandsPage
                  isAdmin={perms.canEditStructure}
                  accounts={board.meta.accounts}
                  partners={board.meta.partners}
                  initiatives={board.initiatives}
                  onOpenInitiative={(i) => setSelected(i)}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/partners"
            element={
              <ViewRoute user={user} path="/partners" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <PartnersPage isAdmin={perms.canEditStructure} onOpenInitiative={(i) => setSelected(i)} initiatives={board.initiatives} />
              </ViewRoute>
            }
          />
          <Route
            path="/campaigns"
            element={
              <ViewRoute user={user} path="/campaigns" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <CampaignsPage
                  isAdmin={perms.canEditMarketing}
                  users={board.meta.users}
                  accounts={board.meta.accounts}
                  partners={board.meta.partners}
                  personas={board.meta.personas}
                  initiatives={board.initiatives}
                  onOpenInitiative={(i) => setSelected(i)}
                  quickFilter={board.filters.quick}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/milestones"
            element={
              <ViewRoute user={user} path="/milestones" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <MilestonesTimelinePage
                  domains={board.meta.domains}
                  users={board.meta.users}
                  initiatives={board.initiatives}
                  onOpenInitiative={(i) => setSelected(i)}
                  onArchiveInitiative={() => board.refresh()}
                  readOnly={!perms.canEditStructure}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/calendar"
            element={
              <ViewRoute user={user} path="/calendar" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <CalendarPage quickFilter={board.filters.quick} />
              </ViewRoute>
            }
          />
          <Route
            path="/gantt"
            element={
              <ViewRoute user={user} path="/gantt" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <GanttPage initiatives={board.initiatives} onOpen={(i) => setSelected(i)} />
              </ViewRoute>
            }
          />
          <Route
            path="/features/:featureId"
            element={
              <FeatureDetailPage
                initiatives={board.initiatives}
                onOpenInitiative={(i) => setSelected(i)}
                onSaved={() => board.refresh()}
                onFeatureUpdated={(updated) => {
                  board.setInitiatives((prev) =>
                    prev.map((i) => {
                      const idx = i.features?.findIndex((f) => f.id === updated.id) ?? -1;
                      if (idx < 0) return i;
                      const next = [...(i.features ?? [])];
                      next[idx] = { ...updated, requirements: next[idx]?.requirements ?? updated.requirements ?? [] };
                      return { ...i, features: next };
                    })
                  );
                }}
                readOnly={!perms.canEditContent}
              />
            }
          />
          <Route
            path="/requirements/kanban"
            element={
              <ViewRoute user={user} path="/product-explorer" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <RequirementsKanbanPage
                  initiatives={board.initiatives}
                  onMoveRequirement={async (id, isDone) => {
                    await api.updateRequirement(id, { isDone, status: isDone ? "DONE" : "NOT_STARTED" });
                    await board.refresh();
                  }}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/products/:productId/execution-board"
            element={
              <ViewRoute user={user} path="/product-explorer" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <ExecutionBoardPage
                  onRefreshBoardSilent={() => void board.refreshSilent()}
                  readOnly={!perms.canEditContent}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/products/:productId/board-settings"
            element={
              <ViewRoute user={user} path="/product-explorer" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <BoardSettingsPage isAdmin={perms.canEditContent} onRefreshBoard={() => board.refresh()} />
              </ViewRoute>
            }
          />
          <Route
            path="/requirements/:requirementId"
            element={
              <RequirementDetailPage
                initiatives={board.initiatives}
                onOpenInitiative={(i) => setSelected(i)}
                onSaved={() => board.refresh()}
                readOnly={!perms.canEditContent}
              />
            }
          />
          {perms.canManageUsers && (
            <>
              <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
              <Route
                path="/admin/users"
                element={
                  <AdminPage
                    mode="users"
                    currentUser={user}
                    quickFilter={board.filters.quick}
                    onMetaChanged={() => void board.refresh()}
                    onUiSettingsChanged={() => void uiSettings.refresh()}
                  />
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <AdminPage
                    mode="settings"
                    currentUser={user}
                    quickFilter={board.filters.quick}
                    onMetaChanged={() => void board.refresh()}
                    onUiSettingsChanged={() => void uiSettings.refresh()}
                  />
                }
              />
              <Route
                path="/agent-setup"
                element={
                  <ViewRoute user={user} path="/agent-setup" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                    <AgentSetupPage />
                  </ViewRoute>
                }
              />
            </>
          )}
          <Route
            path="/register-workspace"
            element={
              <RegisterTeamPage
                onBack={() => navigate("/")}
                prefilledContact={{ email: user.email, name: user.name ?? "" }}
                onWorkspaceProvisioned={async (slug) => {
                  await refreshAuth();
                  navigate(`/t/${encodeURIComponent(slug)}`, { replace: true });
                }}
              />
            }
          />
          <Route
            path="*"
            element={
              location.pathname.startsWith("/t/") ? (
                <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                  <p className="text-sm text-slate-500">{t("app.resolvingWorkspaceLink")}</p>
                </div>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        </Routes>
      )}

      {showCreate && perms.canCreate ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <Card className="max-h-[95vh] w-full max-w-4xl overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("app.createInitiative")}</h2>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                {t("app.close")}
              </Button>
            </div>
            <InitiativeForm
              products={board.meta.products}
              domains={board.meta.domains}
              users={board.meta.users}
              personas={board.meta.personas}
              revenueStreams={board.meta.revenueStreams}
              readOnly={!perms.canCreate}
              adminOnlyFields={perms.isAdmin}
              onSubmit={async (payload) => {
                await api.createInitiative(payload);
                setShowCreate(false);
                await board.refresh();
              }}
            />
          </Card>
        </div>
      ) : null}

      <InitiativeDetailPanel
        initiative={selectedFresh ?? null}
        allInitiatives={board.initiatives}
        users={board.meta.users}
        products={board.meta.products}
        personas={board.meta.personas}
        revenueStreams={board.meta.revenueStreams}
        domains={board.meta.domains}
        currentUserId={user?.id ?? null}
        formDirtyRef={initiativeFormDirtyRef}
        remoteChangePending={hubRemoteChangePending}
        onDismissRemoteChange={() => setHubRemoteChangePending(false)}
        onReloadFromServerAfterRemoteChange={async (id) => {
          const r = await api.getInitiative(id);
          setSelected(r.initiative);
          setHubRemoteChangePending(false);
          await board.refreshSilent();
        }}
        adminOnlyFields={perms.isAdmin}
        readOnly={(() => {
          const roleCode = getRoleCode(user);
          const canEditAsAdmin = roleCode === "SUPER_ADMIN" || roleCode === "ADMIN";
          const canEditAsWriter = perms.canEditContent;
          const isOwnerOrAssignee =
            selectedFresh &&
            user?.id &&
            (selectedFresh.ownerId === user.id || selectedFresh.assignments?.some((a) => a.userId === user.id));
          return !(canEditAsAdmin || canEditAsWriter || isOwnerOrAssignee);
        })()}
        onClose={() => setSelected(null)}
        onSaved={refreshAndClose}
      />
    </AppShell>
  );
}

export default App;
