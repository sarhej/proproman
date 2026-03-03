import { useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { FiltersBar } from "./components/layout/FiltersBar";
import { InitiativeDetailPanel } from "./components/initiatives/InitiativeDetailPanel";
import { InitiativeForm } from "./components/initiatives/InitiativeForm";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { useAuth } from "./hooks/useAuth";
import { useBoardData } from "./hooks/useBoardData";
import { api } from "./lib/api";
import { DomainBoardPage } from "./pages/DomainBoardPage";
import { PriorityGridPage } from "./pages/PriorityGridPage";
import { OwnerBoardPage } from "./pages/OwnerBoardPage";
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
import type { Initiative } from "./types/models";

function App() {
  const { user, loading: authLoading } = useAuth();
  const board = useBoardData();
  const [selected, setSelected] = useState<Initiative | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [devLoginLoading, setDevLoginLoading] = useState(false);
  const [devLoginError, setDevLoginError] = useState<string | null>(null);
  const showDevLogin = import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";

  const isAdmin = user?.role === "ADMIN";

  const selectedFresh = useMemo(
    () => board.initiatives.find((i) => i.id === selected?.id) || selected,
    [board.initiatives, selected]
  );

  if (authLoading) {
    return <div className="p-8">Loading authentication...</div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md p-6">
          <h1 className="mb-2 text-xl font-semibold">DD Product Board</h1>
          <p className="mb-4 text-sm text-slate-600">
            Sign in with Google to manage domain priorities, persona impact, and B2B2C backlog planning.
          </p>
          <div className="grid gap-2">
            <Button onClick={() => (window.location.href = `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/auth/google`)}>
              Continue with Google
            </Button>
            {showDevLogin ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  variant="secondary"
                  disabled={devLoginLoading}
                  onClick={async () => {
                    try {
                      setDevLoginLoading(true);
                      setDevLoginError(null);
                      await api.devLogin("ADMIN");
                      window.location.reload();
                    } catch (error) {
                      setDevLoginError((error as Error).message);
                    } finally {
                      setDevLoginLoading(false);
                    }
                  }}
                >
                  {devLoginLoading ? "Signing in..." : "Dev login (Admin)"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={devLoginLoading}
                  onClick={async () => {
                    try {
                      setDevLoginLoading(true);
                      setDevLoginError(null);
                      await api.devLogin("VIEWER");
                      window.location.reload();
                    } catch (error) {
                      setDevLoginError((error as Error).message);
                    } finally {
                      setDevLoginLoading(false);
                    }
                  }}
                >
                  {devLoginLoading ? "Signing in..." : "Dev login (Viewer)"}
                </Button>
              </div>
            ) : null}
            {devLoginError ? <p className="text-xs text-red-600">{devLoginError}</p> : null}
          </div>
        </Card>
      </div>
    );
  }

  if (!board.meta) {
    return <div className="p-8">Loading data...</div>;
  }

  async function refreshAndClose() {
    await board.refresh();
  }

  return (
    <AppShell
      user={user}
      canCreate={isAdmin}
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
      <FiltersBar
        domains={board.meta.domains}
        users={board.meta.users}
        filters={board.filters}
        onChange={(patch) => board.setFilters((prev) => ({ ...prev, ...patch }))}
      />
      {board.error ? <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{board.error}</div> : null}
      {board.loading ? (
        <div className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading initiatives...</div>
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
            path="/owner"
            element={<OwnerBoardPage users={board.meta.users} initiatives={board.initiatives} onOpen={(i) => setSelected(i)} />}
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
            path="/people-kanban"
            element={
              <PeopleKanbanPage
                initiatives={board.initiatives}
                users={board.meta.users}
                onOpen={(i) => setSelected(i)}
                onReassign={async (initiative, userId) => {
                  await api.updateInitiative(initiative.id, { ownerId: userId });
                  await board.refresh();
                }}
              />
            }
          />
          <Route path="/heatmap" element={<HeatmapPage initiatives={board.initiatives} personas={board.meta.personas} />} />
          <Route path="/buyer-user" element={<BuyerUserPage initiatives={board.initiatives} onOpen={(i) => setSelected(i)} />} />
          <Route path="/gaps" element={<GapsPage initiatives={board.initiatives} onOpen={(i) => setSelected(i)} />} />
          <Route
            path="/product-explorer"
            element={<ProductExplorerPage isAdmin={isAdmin} onOpenInitiative={(i) => setSelected(i)} />}
          />
          <Route
            path="/accounts"
            element={<AccountsPage isAdmin={isAdmin} onOpenInitiative={(i) => setSelected(i)} initiatives={board.initiatives} />}
          />
          <Route
            path="/demands"
            element={
              <DemandsPage
                isAdmin={isAdmin}
                accounts={board.meta.accounts}
                partners={board.meta.partners}
                initiatives={board.initiatives}
                onOpenInitiative={(i) => setSelected(i)}
              />
            }
          />
          <Route
            path="/partners"
            element={<PartnersPage isAdmin={isAdmin} onOpenInitiative={(i) => setSelected(i)} initiatives={board.initiatives} />}
          />
          <Route
            path="/campaigns"
            element={
              <CampaignsPage
                isAdmin={isAdmin}
                users={board.meta.users}
                accounts={board.meta.accounts}
                partners={board.meta.partners}
                personas={board.meta.personas}
                initiatives={board.initiatives}
                onOpenInitiative={(i) => setSelected(i)}
              />
            }
          />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/gantt" element={<GanttPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}

      {showCreate && isAdmin ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <Card className="max-h-[95vh] w-full max-w-4xl overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Create initiative</h2>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                Close
              </Button>
            </div>
            <InitiativeForm
              products={board.meta.products}
              domains={board.meta.domains}
              users={board.meta.users}
              personas={board.meta.personas}
              revenueStreams={board.meta.revenueStreams}
              readOnly={!isAdmin}
              onSubmit={async (payload) => {
                await api.createInitiative(payload);
                setShowCreate(false);
                await board.refresh();
              }}
            />
          </Card>
        </div>
      ) : null}

      <div className="fixed bottom-4 right-4">
        {isAdmin ? <Button onClick={() => setShowCreate(true)}>+ New initiative</Button> : null}
      </div>

      <InitiativeDetailPanel
        initiative={selectedFresh ?? null}
        allInitiatives={board.initiatives}
        users={board.meta.users}
        products={board.meta.products}
        personas={board.meta.personas}
        revenueStreams={board.meta.revenueStreams}
        domains={board.meta.domains}
        readOnly={!isAdmin}
        onClose={() => setSelected(null)}
        onSaved={refreshAndClose}
      />
    </AppShell>
  );
}

export default App;
