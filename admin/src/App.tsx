import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { User, Tenant, TenantRequest, TenantRequestStatus, TenantDetail } from "./api";
import { Button } from "./Button";
import { Card } from "./Card";
import { TenantWorkspaceSettings } from "./TenantWorkspaceSettings";
import { copyText, workspaceSignInUrl } from "./workspaceUrl";

const DEV_ROLES = ["SUPER_ADMIN"] as const;

const SLUG_PATTERN = /^[a-z0-9-]{2,50}$/;

function CopySignInLinkButton({ slug }: { slug: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        void copyText(workspaceSignInUrl(slug)).then((ok) => {
          if (ok) {
            setDone(true);
            window.setTimeout(() => setDone(false), 2000);
          }
        });
      }}
    >
      {done ? "Copied!" : "Copy sign-in link"}
    </Button>
  );
}

function SystemHubBadge() {
  return (
    <span className="inline-block rounded bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
      Tymio hub
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    APPROVED: "bg-emerald-100 text-emerald-800",
    REJECTED: "bg-red-100 text-red-800",
    ACTIVE: "bg-emerald-100 text-emerald-800",
    PROVISIONING: "bg-blue-100 text-blue-800",
    DEPROVISIONING: "bg-amber-100 text-amber-900",
    SUSPENDED: "bg-red-100 text-red-800",
    OWNER: "bg-violet-100 text-violet-800",
    ADMIN: "bg-sky-100 text-sky-800",
    MEMBER: "bg-slate-100 text-slate-800",
    VIEWER: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-slate-100 text-slate-800"}`}>
      {status}
    </span>
  );
}

type Tab = "requests" | "tenants";

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const showDevLogin = import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";
  const [devTenants, setDevTenants] = useState<Tenant[]>([]);
  const [devTenantId, setDevTenantId] = useState("");
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  useEffect(() => {
    if (!showDevLogin) return;
    api.getDevTenants().then(({ tenants }) => {
      setDevTenants(tenants);
      if (tenants.length > 0) setDevTenantId(tenants[0].id);
    }).catch(() => {});
  }, [showDevLogin]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Platform console</h1>
            <p className="text-xs text-slate-500">Workspaces, registration requests (SUPER_ADMIN)</p>
          </div>
        </div>

        <p className="mb-5 text-sm text-slate-600">
          Sign in with your administrator account. Only SUPER_ADMIN users are authorized to access this console.
        </p>

        <div className="grid gap-3">
          <Button onClick={() => (window.location.href = `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/auth/google`)}>
            Continue with Google
          </Button>

          {showDevLogin && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Developer Login</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-xs text-slate-500">Role</span>
                  <select
                    value="SUPER_ADMIN"
                    disabled
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
                    {devTenants.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <Button
                className="mt-2 w-full"
                variant="secondary"
                disabled={devLoading || !devTenantId}
                onClick={async () => {
                  try {
                    setDevLoading(true);
                    setDevError(null);
                    await api.devLogin("SUPER_ADMIN", devTenantId || undefined);
                    onLogin();
                  } catch (err) {
                    setDevError((err as Error).message);
                  } finally {
                    setDevLoading(false);
                  }
                }}
              >
                {devLoading ? "Signing in..." : "Dev Login as SUPER_ADMIN"}
              </Button>
              {devError && <p className="mt-1 text-xs text-red-600">{devError}</p>}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function TenantManagement({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("requests");
  const [statusFilter, setStatusFilter] = useState<TenantRequestStatus | "ALL">("PENDING");
  const [requests, setRequests] = useState<TenantRequest[]>([]);
  const [tenants, setTenants] = useState<(Tenant & { _count?: { memberships: number } })[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [tenantDetail, setTenantDetail] = useState<TenantDetail | null>(null);
  const [slugDraft, setSlugDraft] = useState("");
  const [slugSaving, setSlugSaving] = useState(false);
  const [tenantDeleteBusy, setTenantDeleteBusy] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { requests: data } = await api.getTenantRequests(
        statusFilter === "ALL" ? undefined : statusFilter
      );
      setRequests(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [statusFilter]);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAdminTenants();
      const sorted = [...data].sort((a, b) =>
        a.isSystem === b.isSystem ? 0 : a.isSystem ? -1 : 1
      );
      setTenants(sorted as typeof tenants);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadTenantDetail = useCallback(async (id: string) => {
    try {
      const data = await api.getAdminTenant(id);
      setTenantDetail(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (tab === "requests") void loadRequests();
    else void loadTenants();
  }, [tab, loadRequests, loadTenants]);

  useEffect(() => {
    if (selectedTenantId) void loadTenantDetail(selectedTenantId);
    else setTenantDetail(null);
  }, [selectedTenantId, loadTenantDetail]);

  useEffect(() => {
    if (tenantDetail) setSlugDraft(tenantDetail.slug);
  }, [tenantDetail?.id, tenantDetail?.slug]);

  async function handleReview(id: string, action: "approve" | "reject") {
    const msg = action === "approve"
      ? "This will create the workspace, provision it, and send access to the contact. Continue?"
      : "Are you sure you want to reject this request?";
    if (!confirm(msg)) return;

    const note = action === "reject" ? prompt("Review note (optional)") ?? undefined : undefined;
    setActionError(null);
    try {
      await api.reviewTenantRequest(id, { action, reviewNote: note });
      await loadRequests();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  async function handleTenantStatusToggle(tenant: Tenant) {
    if (tenant.isSystem) {
      setActionError("The Tymio system workspace cannot be suspended.");
      return;
    }
    const next = tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    if (next === "SUSPENDED" && !confirm("Are you sure you want to suspend this workspace?")) return;
    setActionError(null);
    try {
      await api.updateAdminTenant(tenant.id, { status: next });
      await loadTenants();
      if (selectedTenantId === tenant.id) await loadTenantDetail(tenant.id);
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  async function handleRemoveMember(tenantId: string, userId: string) {
    if (!confirm("Are you sure you want to remove this member?")) return;
    setActionError(null);
    try {
      await api.removeTenantMember(tenantId, userId);
      await loadTenantDetail(tenantId);
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  async function handleDeleteTenant(tenant: Tenant) {
    if (tenant.isSystem) return;
    if (
      !confirm(
        `Permanently delete workspace "${tenant.name}"? This removes the platform record; data in the tenant schema may need manual cleanup.`
      )
    ) {
      return;
    }
    setActionError(null);
    setTenantDeleteBusy(true);
    try {
      await api.deleteAdminTenant(tenant.id);
      if (selectedTenantId === tenant.id) setSelectedTenantId(null);
      await loadTenants();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setTenantDeleteBusy(false);
    }
  }

  async function handleSaveSlug() {
    if (!tenantDetail || !selectedTenantId || !SLUG_PATTERN.test(slugDraft)) return;
    if (tenantDetail.isSystem) {
      setActionError("The Tymio system workspace slug cannot be changed.");
      return;
    }
    if (slugDraft === tenantDetail.slug) return;
    setActionError(null);
    setSlugSaving(true);
    try {
      await api.updateAdminTenant(selectedTenantId, { slug: slugDraft });
      await loadTenants();
      await loadTenantDetail(selectedTenantId);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSlugSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
          </div>
          <h1 className="text-base font-bold text-slate-800">Platform console</h1>
          <span className="ml-auto flex items-center gap-3 text-sm text-slate-500">
            {user.email}
            <Button size="sm" variant="ghost" onClick={onLogout}>Sign out</Button>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        {actionError && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
        )}

        {/* Tabs */}
        <div className="mb-5 flex gap-1 rounded-lg bg-slate-200 p-1">
          <button
            onClick={() => { setTab("requests"); setSelectedTenantId(null); }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === "requests" ? "bg-white text-slate-800 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
          >
            Registration Requests
          </button>
          <button
            onClick={() => { setTab("tenants"); setSelectedTenantId(null); }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === "tenants" ? "bg-white text-slate-800 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
          >
            Workspaces
          </button>
        </div>

        {/* Requests Tab */}
        {tab === "requests" && (
          <>
            <div className="mb-3 flex gap-2">
              {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    statusFilter === s
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {loading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading...</p>
            ) : requests.length === 0 ? (
              <Card className="py-12 text-center text-sm text-slate-500">No registration requests.</Card>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                      <th className="px-4 py-2">Workspace</th>
                      <th className="px-4 py-2">Slug</th>
                      <th className="px-4 py-2">Contact</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Created</th>
                      <th className="px-4 py-2">Sign-in link</th>
                      <th className="px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-800">{r.teamName}</div>
                          {r.message && <div className="mt-0.5 text-xs text-slate-400 line-clamp-1">{r.message}</div>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{r.slug}</td>
                        <td className="px-4 py-2.5">
                          <div className="text-slate-700">{r.contactName}</div>
                          <div className="text-xs text-slate-400">{r.contactEmail}</div>
                        </td>
                        <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2.5">
                          <CopySignInLinkButton slug={r.slug} />
                        </td>
                        <td className="px-4 py-2.5">
                          {r.status === "PENDING" ? (
                            <div className="flex gap-1">
                              <Button size="sm" onClick={() => handleReview(r.id, "approve")}>Approve</Button>
                              <Button size="sm" variant="secondary" onClick={() => handleReview(r.id, "reject")}>Reject</Button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">{r.reviewNote || "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Tenants Tab */}
        {tab === "tenants" && !selectedTenantId && (
          <>
            {loading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading...</p>
            ) : tenants.length === 0 ? (
              <Card className="py-12 text-center text-sm text-slate-500">No tenants found.</Card>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                      <th className="px-4 py-2">Workspace</th>
                      <th className="px-4 py-2">Slug</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Members</th>
                      <th className="px-4 py-2">Sign-in link</th>
                      <th className="px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((tenant) => (
                      <tr key={tenant.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
                            <span>{tenant.name}</span>
                            {tenant.isSystem ? <SystemHubBadge /> : null}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{tenant.slug}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={tenant.status} /></td>
                        <td className="px-4 py-2.5 text-slate-600">{tenant._count?.memberships ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <CopySignInLinkButton slug={tenant.slug} />
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="secondary" onClick={() => setSelectedTenantId(tenant.id)}>
                              Details
                            </Button>
                            {!tenant.isSystem &&
                              (tenant.status === "ACTIVE" || tenant.status === "SUSPENDED") && (
                                <Button
                                  size="sm"
                                  variant={tenant.status === "ACTIVE" ? "danger" : "secondary"}
                                  onClick={() => handleTenantStatusToggle(tenant)}
                                >
                                  {tenant.status === "ACTIVE" ? "Suspend" : "Activate"}
                                </Button>
                              )}
                            {!tenant.isSystem && (
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={tenantDeleteBusy}
                                onClick={() => void handleDeleteTenant(tenant)}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Tenant Detail */}
        {tab === "tenants" && selectedTenantId && tenantDetail && (
          <div>
            <button
              onClick={() => setSelectedTenantId(null)}
              className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              Back to list
            </button>

            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-800">{tenantDetail.name}</h2>
                {tenantDetail.isSystem ? <SystemHubBadge /> : null}
                <StatusBadge status={tenantDetail.status} />
              </div>

              <div className="mb-6 space-y-4 rounded-lg border border-slate-100 bg-slate-50/80 p-4">
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Workspace sign-in URL</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      readOnly
                      className="min-w-[200px] flex-1 rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-700"
                      value={workspaceSignInUrl(tenantDetail.slug)}
                    />
                    <CopySignInLinkButton slug={tenantDetail.slug} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Share this link so people land on the correct workspace sign-in page.
                  </p>
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">URL slug</h3>
                  {tenantDetail.isSystem ? (
                    <p className="text-sm text-slate-600">
                      This is the reserved Tymio product workspace; the slug is fixed and cannot be changed.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="grid gap-1">
                        <span className="text-xs text-slate-500">Slug (lowercase letters, numbers, hyphens)</span>
                        <input
                          className="w-56 rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-sm"
                          value={slugDraft}
                          onChange={(e) =>
                            setSlugDraft(
                              e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, "")
                            )
                          }
                        />
                      </label>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveSlug()}
                        disabled={slugSaving || slugDraft === tenantDetail.slug || !SLUG_PATTERN.test(slugDraft)}
                      >
                        {slugSaving ? "Saving…" : "Save slug"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <h3 className="mb-2 text-sm font-semibold text-slate-700">Members</h3>
              {tenantDetail.memberships.length === 0 ? (
                <p className="text-sm text-slate-500">No members yet.</p>
              ) : (
                <div className="overflow-hidden rounded border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                        <th className="px-3 py-1.5">Name</th>
                        <th className="px-3 py-1.5">Email</th>
                        <th className="px-3 py-1.5">Role</th>
                        <th className="px-3 py-1.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenantDetail.memberships.map((m) => (
                        <tr key={m.id} className="border-b last:border-0">
                          <td className="px-3 py-1.5 text-slate-800">{m.user.name}</td>
                          <td className="px-3 py-1.5 text-slate-600">{m.user.email}</td>
                          <td className="px-3 py-1.5"><StatusBadge status={m.role} /></td>
                          <td className="px-3 py-1.5">
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleRemoveMember(tenantDetail.id, m.userId)}
                            >
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <TenantWorkspaceSettings tenantId={tenantDetail.id} />

              {!tenantDetail.isSystem && (
                <div className="mt-6 border-t border-slate-200 pt-4">
                  <h3 className="mb-2 text-sm font-semibold text-red-800">Danger zone</h3>
                  <p className="mb-3 text-sm text-slate-600">
                    Delete this workspace from the platform. This does not automatically drop the tenant database
                    schema.
                  </p>
                  <Button
                    variant="danger"
                    disabled={tenantDeleteBusy}
                    onClick={() => void handleDeleteTenant(tenantDetail)}
                  >
                    {tenantDeleteBusy ? "Deleting…" : "Delete workspace"}
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      const { user: u } = await api.getMe();
      if (u.role !== "SUPER_ADMIN") {
        setUser(null);
        setAuthError("Access denied. Only SUPER_ADMIN users can access this console.");
        return;
      }
      setUser(u);
      setAuthError(null);
    } catch {
      setUser(null);
      setAuthError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void checkAuth(); }, [checkAuth]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <AdminLogin onLogin={() => void checkAuth()} />
        {authError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg">
            {authError}
            <Button size="sm" variant="ghost" className="ml-3" onClick={async () => {
              await api.logout();
              setAuthError(null);
            }}>
              Sign out & try again
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <TenantManagement
      user={user}
      onLogout={async () => {
        await api.logout();
        setUser(null);
        window.location.reload();
      }}
    />
  );
}
