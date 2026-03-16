import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "./components/layout/AppShell";
import { FiltersBar } from "./components/layout/FiltersBar";
import { InitiativeDetailPanel } from "./components/initiatives/InitiativeDetailPanel";
import { InitiativeForm } from "./components/initiatives/InitiativeForm";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { useAuth } from "./hooks/useAuth";
import { useBoardData } from "./hooks/useBoardData";
import { usePermissions } from "./hooks/usePermissions";
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
import type { Initiative, UserRole } from "./types/models";
import { getRoleCode } from "./types/models";

const DEV_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "EDITOR", "MARKETING", "VIEWER"];

function App() {
  const { t } = useTranslation();
  const { user, loading: authLoading, error: authError } = useAuth();
  const board = useBoardData(!!user);
  const perms = usePermissions(user);
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
            <img src="/logo.png" alt="Dr. Digital" className="h-8" />
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
            <img src="/logo.png" alt="Dr. Digital" className="h-8" />
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
            {t("app.pendingMsg", { email: user.email })}
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
            }
          />
          <Route path="/priority" element={<PriorityGridPage initiatives={board.initiatives} onOpen={(i) => setSelected(i)} />} />
          <Route
            path="/raci"
            element={
              <RaciMatrixPage
                initiatives={board.initiatives}
                users={board.meta.users}
                readOnly={!perms.canEditStructure}
                onOpen={(i) => setSelected(i)}
                onChanged={() => board.refresh()}
              />
            }
          />
          <Route
            path="/status-kanban"
            element={
              <StatusKanbanPage
                initiatives={board.initiatives}
                onOpen={(i) => setSelected(i)}
                onMove={async (initiative, nextStatus) => {
                  await api.updateInitiative(initiative.id, { status: nextStatus });
                  await board.refresh();
                }}
              />
            }
          />
          <Route
            path="/accountability"
            element={
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
            }
          />
          <Route
            path="/kpi-dashboard"
            element={
              <KpiDashboardPage
                domains={board.meta.domains}
                users={board.meta.users}
                initiatives={board.initiatives}
                onOpenInitiative={(i) => setSelected(i)}
              />
            }
          />
          <Route path="/heatmap" element={<HeatmapPage initiatives={board.initiatives} personas={board.meta.personas} />} />
          <Route path="/buyer-user" element={<BuyerUserPage initiatives={board.initiatives} onOpen={(i) => setSelected(i)} />} />
          <Route path="/gaps" element={<GapsPage initiatives={board.initiatives} onOpen={(i) => setSelected(i)} />} />
          <Route
            path="/product-explorer"
            element={
              <ProductExplorerPage
                isAdmin={perms.canEditStructure}
                currentUserId={user?.id ?? null}
                onOpenInitiative={(i) => setSelected(i)}
                quickFilter={board.filters.quick}
              />
            }
          />
          <Route
            path="/accounts"
            element={<AccountsPage isAdmin={perms.canEditStructure} onOpenInitiative={(i) => setSelected(i)} initiatives={board.initiatives} quickFilter={board.filters.quick} />}
          />
          <Route
            path="/demands"
            element={
              <DemandsPage
                isAdmin={perms.canEditStructure}
                accounts={board.meta.accounts}
                partners={board.meta.partners}
                initiatives={board.initiatives}
                onOpenInitiative={(i) => setSelected(i)}
                quickFilter={board.filters.quick}
              />
            }
          />
          <Route
            path="/partners"
            element={<PartnersPage isAdmin={perms.canEditStructure} onOpenInitiative={(i) => setSelected(i)} initiatives={board.initiatives} quickFilter={board.filters.quick} />}
          />
          <Route
            path="/campaigns"
            element={
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
            }
          />
          <Route
            path="/milestones"
            element={
              <MilestonesTimelinePage
                domains={board.meta.domains}
                users={board.meta.users}
                initiatives={board.initiatives}
                onOpenInitiative={(i) => setSelected(i)}
                onArchiveInitiative={() => board.refresh()}
                readOnly={!perms.canEditStructure}
              />
            }
          />
          <Route path="/calendar" element={<CalendarPage quickFilter={board.filters.quick} />} />
          <Route path="/gantt" element={<GanttPage initiatives={board.initiatives} onOpen={(i) => setSelected(i)} />} />
          {perms.canManageUsers && (
            <Route path="/admin" element={<AdminPage currentUser={user} quickFilter={board.filters.quick} onMetaChanged={() => board.refresh()} />} />
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
