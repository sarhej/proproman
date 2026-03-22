import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { AppShell } from "./components/layout/AppShell";
import { FiltersBar } from "./components/layout/FiltersBar";
import { InitiativeDetailPanel } from "./components/initiatives/InitiativeDetailPanel";
import { InitiativeForm } from "./components/initiatives/InitiativeForm";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { ViewRoute } from "./components/ViewRoute";
import { useAuth } from "./hooks/useAuth";
import { useBoardData } from "./hooks/useBoardData";
import { usePermissions } from "./hooks/usePermissions";
import { useUiSettings } from "./hooks/useUiSettings";
import { api } from "./lib/api";
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
import { KpiDashboardPage } from "./pages/KpiDashboardPage";
import { MilestonesTimelinePage } from "./pages/MilestonesTimelinePage";
import { FeatureDetailPage } from "./pages/FeatureDetailPage";
import { RequirementDetailPage } from "./pages/RequirementDetailPage";
import { RequirementsKanbanPage } from "./pages/RequirementsKanbanPage";
import type { Initiative, UserRole } from "./types/models";
import { getRoleCode } from "./types/models";

const DEV_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "EDITOR", "MARKETING", "VIEWER"];

function App() {
  const { t } = useTranslation();
  const { user, loading: authLoading, error: authError } = useAuth();
  const board = useBoardData(!!user);
  const perms = usePermissions(user);
  const uiSettings = useUiSettings(!!user && user.role !== "PENDING");
  const [selected, setSelected] = useState<Initiative | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [devLoginLoading, setDevLoginLoading] = useState(false);
  const [devLoginError, setDevLoginError] = useState<string | null>(null);
  const showDevLogin = import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const hideFilters = location.pathname === "/gantt";

  const selectedFresh = useMemo(
    () => board.initiatives.find((i) => i.id === selected?.id) || selected,
    [board.initiatives, selected]
  );

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

  if (authLoading) {
    return <div className="p-8">{t("app.loadingAuth")}</div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md p-6">
          <div className="mb-4 flex items-center gap-3">
            <img src="/logo.svg" alt="Tymio" className="h-8" />
            <span className="text-lg font-semibold text-slate-500">{t("app.brand")}</span>
          </div>
          <p className="mb-4 text-sm text-slate-600">
            {t("app.signInDesc")}
          </p>
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
            {showDevLogin ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DEV_ROLES.map((role) => (
                  <Button
                    key={role}
                    variant="secondary"
                    disabled={devLoginLoading}
                    onClick={async () => {
                      try {
                        setDevLoginLoading(true);
                        setDevLoginError(null);
                        await api.devLogin(role);
                        window.location.reload();
                      } catch (error) {
                        setDevLoginError((error as Error).message);
                      } finally {
                        setDevLoginLoading(false);
                      }
                    }}
                  >
                    {devLoginLoading ? "..." : `Dev ${role}`}
                  </Button>
                ))}
              </div>
            ) : null}
            {devLoginError ? <p className="text-xs text-red-600">{devLoginError}</p> : null}
          </div>
        </Card>
      </div>
    );
  }

  if (user.role === "PENDING") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md p-6 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <img src="/logo.svg" alt="Tymio" className="h-8" />
            <span className="text-lg font-semibold text-slate-500">{t("app.brand")}</span>
          </div>
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-800">{t("app.pendingTitle")}</h2>
          <p className="mb-1 text-sm text-slate-600">
            <Trans
              i18nKey="app.pendingMsg"
              values={{ email: user.email }}
              components={{ 1: <strong className="font-semibold text-slate-800" /> }}
            />
          </p>
          <p className="mb-6 text-sm text-slate-500">
            {t("app.pendingDesc")}
          </p>
          <Button
            variant="secondary"
            onClick={async () => {
              await api.logout();
              window.location.reload();
            }}
          >
            {t("app.signOut")}
          </Button>
        </Card>
      </div>
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
      onNewInitiative={perms.canCreate ? () => setShowCreate(true) : undefined}
      onLogout={async () => {
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
      {!hideFilters && (
        <div data-print-hide>
          <FiltersBar
            domains={board.meta.domains}
            users={board.meta.users}
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
                  onRefreshBoard={board.refresh}
                  quickFilter={board.filters.quick}
                  boardFilters={board.filters}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/accounts"
            element={
              <ViewRoute user={user} path="/accounts" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <AccountsPage isAdmin={perms.canEditStructure} onOpenInitiative={(i) => setSelected(i)} initiatives={board.initiatives} quickFilter={board.filters.quick} />
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
                  quickFilter={board.filters.quick}
                />
              </ViewRoute>
            }
          />
          <Route
            path="/partners"
            element={
              <ViewRoute user={user} path="/partners" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <PartnersPage isAdmin={perms.canEditStructure} onOpenInitiative={(i) => setSelected(i)} initiatives={board.initiatives} quickFilter={board.filters.quick} />
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
              <ViewRoute user={user} path="/requirements/kanban" hiddenNavPaths={uiSettings.hiddenNavPaths}>
                <RequirementsKanbanPage
                  initiatives={board.initiatives}
                  onMoveRequirement={async (id, isDone) => {
                    await api.updateRequirement(id, {
                      isDone,
                      status: isDone ? "DONE" : "NOT_STARTED"
                    });
                    await board.refresh();
                  }}
                />
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
            <Route
              path="/admin"
              element={
                <AdminPage
                  currentUser={user}
                  quickFilter={board.filters.quick}
                  onMetaChanged={() => void board.refresh()}
                  onUiSettingsChanged={() => void uiSettings.refresh()}
                />
              }
            />
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
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
