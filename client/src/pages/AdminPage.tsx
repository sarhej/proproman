import { OntologyTab } from "./admin/OntologyTab";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { MANAGED_NAV_PATHS } from "../lib/navViewPaths";
import { navSections } from "../lib/navSections";
import type {
  AuditAction,
  AuditEntry,
  DeliveryChannel,
  Domain,
  NotificationRecipientKind,
  NotificationRule,
  Persona,
  PersonaCategory,
  RevenueStream,
  User,
  UserRole
} from "../types/models";

const ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "EDITOR", "MARKETING", "VIEWER", "PENDING"];
const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800",
  ADMIN: "bg-blue-100 text-blue-800",
  EDITOR: "bg-green-100 text-green-800",
  MARKETING: "bg-orange-100 text-orange-800",
  VIEWER: "bg-gray-100 text-gray-700",
  PENDING: "bg-amber-100 text-amber-800",
};

function formatDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

const ENTITY_TYPES = ["INITIATIVE", "FEATURE", "CAMPAIGN", "PRODUCT", "DOMAIN", "PERSONA", "REVENUE_STREAM", "ACCOUNT", "PARTNER", "DEMAND", "MILESTONE", "KPI", "STAKEHOLDER", "DECISION", "RISK", "REQUIREMENT", "ASSET", "CAMPAIGN_LINK", "COMMENT", "SUCCESS_CRITERION", "CAPABILITY", "CAPABILITY_BINDING", "COMPILED_BRIEF", "UI_SETTINGS"] as const;
const AUDIT_ACTIONS: AuditAction[] = ["CREATED", "UPDATED", "DELETED", "STATUS_CHANGED", "ROLE_CHANGED", "LOGIN"];
const RECIPIENT_KINDS: NotificationRecipientKind[] = ["OBJECT_OWNER", "OBJECT_ROLE", "GLOBAL_ROLE", "OBJECT_ASSIGNEE"];
const DELIVERY_CHANNELS: DeliveryChannel[] = ["IN_APP", "EMAIL", "SLACK", "WHATSAPP"];

type Tab = "users" | "activity" | "settings" | "data" | "notificationRules" | "ontology";

export function AdminPage({
  currentUser,
  quickFilter,
  onMetaChanged,
  onUiSettingsChanged
}: {
  currentUser: User;
  quickFilter?: string;
  onMetaChanged?: () => void;
  /** Nav visibility saves: refresh shell settings only (avoid full board loading flash). */
  onUiSettingsChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("users");

  const tabs: { key: Tab; label: string }[] = [
    { key: "users", label: t("admin.users") },
    { key: "settings", label: t("admin.settings") },
    { key: "data", label: t("admin.data") },
    { key: "activity", label: t("admin.activity") },
    { key: "notificationRules", label: t("admin.notificationRules") },
    { key: "ontology", label: t("admin.ontology") }
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto border-b lg:overflow-x-visible">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`shrink-0 px-4 py-2 -mb-px text-sm font-medium ${tab === t.key ? "border-b-2 border-indigo-600 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "users" && <UsersTab currentUser={currentUser} quickFilter={quickFilter} />}
      {tab === "settings" && (
        <SettingsTab currentUser={currentUser} onMetaChanged={onMetaChanged} onUiSettingsChanged={onUiSettingsChanged} />
      )}
      {tab === "data" && <DataTab />}
      {tab === "activity" && <ActivityTab quickFilter={quickFilter} />}
      {tab === "notificationRules" && <NotificationRulesTab />}
      {tab === "ontology" && <OntologyTab />}
    </div>
  );
}

function InlineEdit({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        className="text-left hover:underline hover:text-indigo-600 cursor-pointer"
        onClick={() => setEditing(true)}
        title={t("common.clickToEdit")}
      >
        {value}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className="rounded border border-indigo-300 px-1.5 py-0.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-indigo-400"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
    />
  );
}

function UsersTab({ currentUser, quickFilter }: { currentUser: User; quickFilter?: string }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("VIEWER");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState("");
  const [aliasError, setAliasError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { users } = await api.getUsers();
      setUsers(users);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateField = async (id: string, data: Partial<User>) => {
    try {
      const { user } = await api.updateUser(id, data);
      setUsers((prev) => prev.map((u) => (u.id === id ? user : u)));
    } catch {
      /* ignore */
    }
  };

  const addUser = async () => {
    if (!newEmail || !newName) return;
    try {
      const { user } = await api.createUser({ email: newEmail, name: newName, role: newRole });
      setUsers((prev) => [...prev, user]);
      setShowAdd(false);
      setNewEmail("");
      setNewName("");
      setNewRole("VIEWER");
    } catch {
      /* ignore */
    }
  };

  const addAlias = async (userId: string) => {
    if (!aliasInput.trim()) return;
    setAliasError(null);
    try {
      await api.addUserEmail(userId, aliasInput.trim());
      setAliasInput("");
      load();
    } catch (e: unknown) {
      const err = e as { status?: number; body?: { error?: string; existingUserName?: string | null } };
      if (err.status === 409 && err.body?.existingUserName) {
        setAliasError(t("admin.emailUsedByOther", { name: err.body.existingUserName }));
      } else {
        setAliasError(err.body?.error ?? String(e));
      }
    }
  };

  const removeAlias = async (userId: string, emailId: string) => {
    try {
      await api.removeUserEmail(userId, emailId);
      load();
    } catch {
      /* ignore */
    }
  };

  const deleteUser = async (user: User) => {
    if (user.id === currentUser.id) return;
    if (!window.confirm(t("admin.deleteUserConfirm", { name: user.name }))) return;
    try {
      await api.deleteUser(user.id);
      load();
    } catch {
      /* ignore */
    }
  };

  const availableRoles = currentUser.role === "SUPER_ADMIN" ? ROLES : ROLES.filter((r) => r !== "SUPER_ADMIN");

  const filteredUsers = useMemo(() => {
    let list = users;
    const q = quickFilter?.trim().toLowerCase();
    if (q) {
      list = list.filter((u) => {
        const aliases = (u.emails ?? []).map((e) => e.email).join(" ");
        const hay = [u.name, u.email, u.role, aliases].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    return [...list].sort((a, b) => {
      if (a.role === "PENDING" && b.role !== "PENDING") return -1;
      if (a.role !== "PENDING" && b.role === "PENDING") return 1;
      return 0;
    });
  }, [quickFilter, users]);

  if (loading) return <p className="text-sm text-gray-500">{t("admin.loadingUsers")}</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? t("common.cancel") : t("admin.addUser")}
        </button>
      </div>

      {showAdd && (
        <div className="flex flex-wrap items-end gap-3 rounded border bg-gray-50 p-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("common.email")}</label>
            <input className="rounded border px-2 py-1 text-sm" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={t("admin.emailPlaceholder")} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("common.name")}</label>
            <input className="rounded border px-2 py-1 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("admin.namePlaceholder")} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("common.role")}</label>
            <select className="rounded border px-2 py-1 text-sm" value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
              {availableRoles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700" onClick={addUser}>{t("common.save")}</button>
        </div>
      )}

      {/* Mobile card view */}
      <div className="grid gap-3 lg:hidden">
        {filteredUsers.map((u) => {
          const aliases = (u.emails ?? []).filter((e) => !e.isPrimary);
          const isExpanded = expandedUser === u.id;
          return (
            <div key={u.id} className={`rounded-lg border p-3 ${u.role === "PENDING" ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
              <div className="flex items-center gap-3 mb-2">
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt="" className="h-10 w-10 rounded-full" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                    {u.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{u.name}</div>
                  <div className="text-xs text-gray-500 truncate">{u.email}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <select
                  className={`rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role]}`}
                  value={u.role}
                  onChange={(e) => updateField(u.id, { role: e.target.value as UserRole })}
                  disabled={u.id === currentUser.id || (!["SUPER_ADMIN"].includes(currentUser.role) && u.role === "SUPER_ADMIN")}
                >
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  className={`rounded px-2 py-0.5 text-xs font-medium ${u.isActive !== false ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                  onClick={() => updateField(u.id, { isActive: !(u.isActive !== false) })}
                  disabled={u.id === currentUser.id}
                >
                  {u.isActive !== false ? t("common.active") : t("common.inactive")}
                </button>
                {u.googleId ? (
                  <span className="text-green-600 text-xs font-medium">Google &#10003;</span>
                ) : (
                  <span className="text-amber-500 text-xs font-medium">Unlinked</span>
                )}
                {u.id !== currentUser.id && (
                  <button
                    className="rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    onClick={() => deleteUser(u)}
                    title={t("admin.deleteUser")}
                  >
                    {t("admin.deleteUser")}
                  </button>
                )}
              </div>
              {aliases.length > 0 && (
                <button
                  className="text-xs text-indigo-600"
                  onClick={() => { setExpandedUser(isExpanded ? null : u.id); setAliasInput(""); }}
                >
                  {isExpanded ? "▲" : "▼"} {aliases.length} {t("admin.aliases")}
                </button>
              )}
              {isExpanded && (
                <div className="mt-2 border-t pt-2">
                  <div className="space-y-1.5">
                    {(u.emails ?? []).map((alias) => (
                      <div key={alias.id} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-700">{alias.email}</span>
                        {alias.isPrimary && <span className="rounded bg-blue-100 text-blue-700 px-1.5 py-0 text-[10px] font-medium">{t("common.primary")}</span>}
                        {!alias.isPrimary && (
                          <button className="text-red-500 text-[10px]" onClick={() => removeAlias(u.id, alias.id)}>
                            {t("common.remove")}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      className="rounded border px-2 py-1 text-xs flex-1"
                      value={aliasInput}
                      onChange={(e) => { setAliasInput(e.target.value); setAliasError(null); }}
                      placeholder={t("admin.aliasPlaceholder")}
                      onKeyDown={(e) => { if (e.key === "Enter") addAlias(u.id); }}
                    />
                    <button className="rounded bg-indigo-600 px-2 py-1 text-xs text-white" onClick={() => addAlias(u.id)}>
                      {t("common.add")}
                    </button>
                  </div>
                  {aliasError && expandedUser === u.id && (
                    <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">{aliasError}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table view */}
      <div className="hidden lg:block overflow-x-auto text-sm">
        <div className="grid grid-cols-[minmax(120px,1fr)_minmax(180px,1.5fr)_140px_80px_140px_80px_80px] border-b text-left text-xs text-gray-500 uppercase tracking-wider">
          <div className="py-2 px-3">{t("common.name")}</div>
          <div className="py-2 px-3">{t("common.email")}</div>
          <div className="py-2 px-3">{t("common.role")}</div>
          <div className="py-2 px-3 text-center">{t("common.active")}</div>
          <div className="py-2 px-3">{t("admin.lastLogin")}</div>
          <div className="py-2 px-3 text-center">{t("admin.google")}</div>
          <div className="py-2 px-3 text-center">{t("admin.deleteUser")}</div>
        </div>
        <div>
            {filteredUsers.map((u) => {
              const aliases = (u.emails ?? []).filter((e) => !e.isPrimary);
              const isExpanded = expandedUser === u.id;
              return (
                <div key={u.id} className="border-b hover:bg-gray-50">
                    <div className={`grid grid-cols-[minmax(120px,1fr)_minmax(180px,1.5fr)_140px_80px_140px_80px_80px] items-center ${u.role === "PENDING" ? "bg-amber-50" : ""}`}>
                      <div className="py-2 px-3 flex items-center gap-2">
                        {u.avatarUrl && <img src={u.avatarUrl} alt="" className="h-6 w-6 rounded-full" />}
                        <InlineEdit value={u.name} onSave={(v) => updateField(u.id, { name: v })} />
                        {u.role === "PENDING" && <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 uppercase">{t("admin.newNoAccess")}</span>}
                      </div>
                      <div className="py-2 px-3 text-gray-600">
                        <div className="flex items-center gap-1.5">
                          {u.googleId ? (
                            <span title={t("admin.emailLocked")}>{u.email}</span>
                          ) : (
                            <InlineEdit value={u.email} onSave={(v) => updateField(u.id, { email: v })} />
                          )}
                          {aliases.length > 0 && (
                            <span className="rounded-full bg-indigo-100 text-indigo-700 px-1.5 py-0 text-[10px] font-medium">
                              +{aliases.length}
                            </span>
                          )}
                          <button
                            className="ml-1 text-gray-400 hover:text-indigo-600 text-xs"
                            onClick={() => { setExpandedUser(isExpanded ? null : u.id); setAliasInput(""); }}
                            title={t("admin.manageAliases")}
                          >
                            {isExpanded ? "▲" : "▼"}
                          </button>
                        </div>
                      </div>
                      <div className="py-2 px-3">
                        <select
                          className={`rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role]}`}
                          value={u.role}
                          onChange={(e) => updateField(u.id, { role: e.target.value as UserRole })}
                          disabled={u.id === currentUser.id || (!["SUPER_ADMIN"].includes(currentUser.role) && u.role === "SUPER_ADMIN")}
                        >
                          {availableRoles.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <div className="py-2 px-3 text-center">
                        <button
                          className={`rounded px-2 py-0.5 text-xs font-medium ${u.isActive !== false ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                          onClick={() => updateField(u.id, { isActive: !(u.isActive !== false) })}
                          disabled={u.id === currentUser.id}
                        >
                          {u.isActive !== false ? t("common.active") : t("common.inactive")}
                        </button>
                      </div>
                      <div className="py-2 px-3 text-gray-500 text-xs">{formatDate(u.lastLoginAt)}</div>
                      <div className="py-2 px-3 text-center">
                        {u.googleId ? (
                          <span className="text-green-600 text-xs font-medium">Linked</span>
                        ) : (
                          <span className="text-amber-500 text-xs font-medium">Unlinked</span>
                        )}
                      </div>
                      <div className="py-2 px-3 text-center">
                        {u.id !== currentUser.id ? (
                          <button
                            className="text-red-600 hover:text-red-800 text-xs font-medium"
                            onClick={() => deleteUser(u)}
                            title={t("admin.deleteUser")}
                          >
                            {t("admin.deleteUser")}
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="bg-gray-50 border-t px-6 py-3">
                        <p className="text-xs text-gray-500 font-medium mb-2">{t("admin.aliasesDesc")}</p>
                        <div className="space-y-1.5">
                          {(u.emails ?? []).map((alias) => (
                            <div key={alias.id} className="flex items-center gap-2 text-xs">
                              <span className="text-gray-700">{alias.email}</span>
                              {alias.isPrimary && <span className="rounded bg-blue-100 text-blue-700 px-1.5 py-0 text-[10px] font-medium">{t("common.primary")}</span>}
                              {!alias.isPrimary && (
                                <button
                                  className="text-red-500 hover:text-red-700 text-[10px]"
                                  onClick={() => removeAlias(u.id, alias.id)}
                                >
                                  {t("common.remove")}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            className="rounded border px-2 py-1 text-xs w-60"
                            value={aliasInput}
                            onChange={(e) => { setAliasInput(e.target.value); setAliasError(null); }}
                            placeholder={t("admin.aliasPlaceholder")}
                            onKeyDown={(e) => { if (e.key === "Enter") addAlias(u.id); }}
                          />
                          <button
                            className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700"
                            onClick={() => addAlias(u.id)}
                          >
                            {t("common.add")}
                          </button>
                        </div>
                        {aliasError && expandedUser === u.id && (
                          <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">{aliasError}</p>
                        )}
                      </div>
                    )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function ActivityTab({ quickFilter }: { quickFilter?: string }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("");
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filterAction) params.set("action", filterAction);
      if (filterEntity) params.set("entityType", filterEntity);
      const data = await api.getAuditLog(params);
      setEntries(data.entries);
      setTotal(data.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [page, filterAction, filterEntity]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(total / limit);

  const filteredEntries = useMemo(() => {
    const q = quickFilter?.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const hay = [e.user.name, e.action, e.entityType, e.entityId ?? "", e.details ? JSON.stringify(e.details) : ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [quickFilter, entries]);

  const ACTION_COLORS: Record<string, string> = {
    CREATED: "bg-green-100 text-green-700",
    UPDATED: "bg-blue-100 text-blue-700",
    DELETED: "bg-red-100 text-red-700",
    STATUS_CHANGED: "bg-yellow-100 text-yellow-800",
    ROLE_CHANGED: "bg-purple-100 text-purple-700",
    LOGIN: "bg-gray-100 text-gray-600"
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select className="rounded border px-2 py-1 text-sm" value={filterAction} onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}>
          <option value="">{t("admin.allActions")}</option>
          {["CREATED", "UPDATED", "DELETED", "STATUS_CHANGED", "ROLE_CHANGED", "LOGIN"].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select className="rounded border px-2 py-1 text-sm" value={filterEntity} onChange={(e) => { setFilterEntity(e.target.value); setPage(1); }}>
          <option value="">{t("admin.allEntities")}</option>
          {["USER", "INITIATIVE", "FEATURE", "CAMPAIGN"].map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">{t("admin.loadingActivity")}</p>
      ) : filteredEntries.length === 0 ? (
        <p className="text-sm text-gray-500">{t("admin.noActivity")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="py-2 px-3">{t("admin.time")}</th>
                <th className="py-2 px-3">{t("admin.user")}</th>
                <th className="py-2 px-3">{t("admin.action")}</th>
                <th className="py-2 px-3">{t("admin.entity")}</th>
                <th className="py-2 px-3">{t("admin.details")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((e) => (
                <tr key={e.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(e.createdAt)}</td>
                  <td className="py-2 px-3 flex items-center gap-1.5">
                    {e.user.avatarUrl && <img src={e.user.avatarUrl} alt="" className="h-5 w-5 rounded-full" />}
                    <span className="text-xs">{e.user.name}</span>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[e.action] ?? "bg-gray-100 text-gray-600"}`}>{e.action}</span>
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-600">
                    {e.entityType}
                    {e.entityId && <span className="ml-1 text-gray-400 font-mono">{e.entityId.slice(0, 8)}</span>}
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-500 max-w-xs truncate">
                    {e.details ? JSON.stringify(e.details) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{t("admin.entries", { total })}</span>
          <div className="flex gap-2">
            <button
              className="rounded border px-3 py-1 text-sm disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t("common.previous")}
            </button>
            <span className="py-1 text-gray-600">{t("admin.page", { page, totalPages })}</span>
            <button
              className="rounded border px-3 py-1 text-sm disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("common.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRulesTab() {
  const { t } = useTranslation();
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    action: "CREATED" as AuditAction,
    entityType: "INITIATIVE",
    eventKind: "",
    recipientKind: "OBJECT_OWNER" as NotificationRecipientKind,
    recipientRole: "",
    deliveryChannels: ["IN_APP"] as DeliveryChannel[],
    enabled: true
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { rules: r } = await api.getNotificationRules();
      setRules(r);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditingId(null);
    setForm({
      action: "CREATED",
      entityType: "INITIATIVE",
      eventKind: "",
      recipientKind: "OBJECT_OWNER",
      recipientRole: "",
      deliveryChannels: ["IN_APP"],
      enabled: true
    });
    setShowForm(true);
  };

  const openEdit = (rule: NotificationRule) => {
    setEditingId(rule.id);
    setForm({
      action: rule.action,
      entityType: rule.entityType,
      eventKind: rule.eventKind ?? "",
      recipientKind: rule.recipientKind,
      recipientRole: rule.recipientRole ?? "",
      deliveryChannels: Array.isArray(rule.deliveryChannels) ? (rule.deliveryChannels as DeliveryChannel[]) : ["IN_APP"],
      enabled: rule.enabled
    });
    setShowForm(true);
  };

  const toggleChannel = (ch: DeliveryChannel) => {
    setForm((prev) => ({
      ...prev,
      deliveryChannels: prev.deliveryChannels.includes(ch)
        ? prev.deliveryChannels.filter((c) => c !== ch)
        : [...prev.deliveryChannels, ch]
    }));
  };

  const submit = async () => {
    try {
      const payload = {
        action: form.action,
        entityType: form.entityType,
        eventKind: form.eventKind.trim() || null,
        recipientKind: form.recipientKind,
        recipientRole: form.recipientRole.trim() || null,
        deliveryChannels: form.deliveryChannels.length ? form.deliveryChannels : ["IN_APP"],
        enabled: form.enabled
      };
      if (editingId) {
        await api.updateNotificationRule(editingId, payload);
      } else {
        await api.createNotificationRule(payload);
      }
      setShowForm(false);
      load();
    } catch {
      /* ignore */
    }
  };

  const deleteRule = async (id: string) => {
    if (!window.confirm(t("admin.deleteRule") + "?")) return;
    try {
      await api.deleteNotificationRule(id);
      load();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{t("admin.notificationRulesDesc")}</p>
      <div className="flex justify-between items-center">
        <button
          type="button"
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
          onClick={openAdd}
        >
          {t("admin.addRule")}
        </button>
      </div>

      {showForm && (
        <div className="rounded border border-gray-200 bg-gray-50 p-4 space-y-3 max-w-lg">
          <h3 className="text-sm font-medium text-gray-800">{editingId ? t("admin.editRule") : t("admin.addRule")}</h3>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-600">{t("admin.ruleAction")}</span>
              <select
                className="rounded border px-2 py-1"
                value={form.action}
                onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as AuditAction }))}
              >
                {AUDIT_ACTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-600">{t("admin.ruleEntityType")}</span>
              <select
                className="rounded border px-2 py-1"
                value={form.entityType}
                onChange={(e) => setForm((f) => ({ ...f, entityType: e.target.value }))}
              >
                {ENTITY_TYPES.map((et) => (
                  <option key={et} value={et}>{et}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-600">{t("admin.ruleEventKind")}</span>
              <input
                className="rounded border px-2 py-1"
                value={form.eventKind}
                onChange={(e) => setForm((f) => ({ ...f, eventKind: e.target.value }))}
                placeholder="e.g. INITIATIVE_STATUS_CHANGED"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-600">{t("admin.ruleRecipientKind")}</span>
              <select
                className="rounded border px-2 py-1"
                value={form.recipientKind}
                onChange={(e) => setForm((f) => ({ ...f, recipientKind: e.target.value as NotificationRecipientKind }))}
              >
                {RECIPIENT_KINDS.map((k) => (
                  <option key={k} value={k}>{t(`admin.recipientKind.${k}`)}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-600">{t("admin.ruleRecipientRole")}</span>
              <input
                className="rounded border px-2 py-1"
                value={form.recipientRole}
                onChange={(e) => setForm((f) => ({ ...f, recipientRole: e.target.value }))}
                placeholder="e.g. ACCOUNTABLE, ADMIN"
              />
            </label>
            <div>
              <span className="text-gray-600 text-sm block mb-1">{t("admin.ruleChannels")}</span>
              <div className="flex flex-wrap gap-2">
                {DELIVERY_CHANNELS.map((ch) => (
                  <label key={ch} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={form.deliveryChannels.includes(ch)}
                      onChange={() => toggleChannel(ch)}
                    />
                    {t(`admin.channel.${ch}`)}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              {t("admin.ruleEnabled")}
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
              onClick={submit}
            >
              {editingId ? t("admin.editRule") : t("common.add")}
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              onClick={() => setShowForm(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">{t("admin.loadingRules")}</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-gray-500">{t("admin.noRules")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="py-2 px-3">{t("admin.ruleAction")}</th>
                <th className="py-2 px-3">{t("admin.ruleEntityType")}</th>
                <th className="py-2 px-3">{t("admin.ruleRecipientKind")}</th>
                <th className="py-2 px-3">{t("admin.ruleChannels")}</th>
                <th className="py-2 px-3">{t("admin.ruleEnabled")}</th>
                <th className="py-2 px-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3">{rule.action}</td>
                  <td className="py-2 px-3">{rule.entityType}</td>
                  <td className="py-2 px-3">{t(`admin.recipientKind.${rule.recipientKind}`)}</td>
                  <td className="py-2 px-3">
                    {Array.isArray(rule.deliveryChannels)
                      ? (rule.deliveryChannels as string[]).map((ch) => t(`admin.channel.${ch}`)).join(", ")
                      : "In-app"}
                  </td>
                  <td className="py-2 px-3">{rule.enabled ? t("common.active") : t("common.inactive")}</td>
                  <td className="py-2 px-3">
                    <button
                      type="button"
                      className="text-indigo-600 hover:text-indigo-800 text-xs mr-2"
                      onClick={() => openEdit(rule)}
                    >
                      {t("admin.editRule")}
                    </button>
                    <button
                      type="button"
                      className="text-red-600 hover:text-red-800 text-xs"
                      onClick={() => deleteRule(rule.id)}
                    >
                      {t("admin.deleteRule")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Settings Tab ─────────────────────────────────────────────────── */

const PERSONA_CATEGORIES: PersonaCategory[] = ["BUYER", "USER", "NONE"];
const PERSONA_CAT_COLORS: Record<PersonaCategory, string> = {
  BUYER: "bg-amber-100 text-amber-800",
  USER: "bg-sky-100 text-sky-800",
  NONE: "bg-gray-100 text-gray-600"
};

function SettingsTab({
  currentUser,
  onMetaChanged,
  onUiSettingsChanged
}: {
  currentUser: User;
  onMetaChanged?: () => void;
  onUiSettingsChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<"domains" | "personas" | "revenue" | "views">("domains");
  const sections: { key: typeof section; label: string }[] = [
    { key: "domains", label: t("admin.domains") },
    { key: "personas", label: t("admin.personas") },
    { key: "revenue", label: t("admin.revenueStreams") },
    ...(currentUser.role === "SUPER_ADMIN" ? [{ key: "views" as const, label: t("admin.navViews.section") }] : [])
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <button
            key={s.key}
            className={`rounded-full px-3 py-1 text-xs font-medium ${section === s.key ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            onClick={() => setSection(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === "domains" && <DomainsSection onChanged={onMetaChanged} />}
      {section === "personas" && <PersonasSection onChanged={onMetaChanged} />}
      {section === "revenue" && <RevenueStreamsSection onChanged={onMetaChanged} />}
      {section === "views" && currentUser.role === "SUPER_ADMIN" && <NavViewsSection onSaved={onUiSettingsChanged} />}
    </div>
  );
}

function NavViewsSection({ onSaved }: { onSaved?: () => void }) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { hiddenNavPaths } = await api.getUiSettings();
      setHidden(new Set(hiddenNavPaths));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleCount = MANAGED_NAV_PATHS.length - hidden.size;

  const setPathVisible = async (path: string, visible: boolean) => {
    const next = new Set(hidden);
    if (visible) next.delete(path);
    else {
      if (visibleCount <= 1 && !hidden.has(path)) {
        setErr(t("admin.navViews.keepOne"));
        return;
      }
      next.add(path);
    }
    setBusy(true);
    setErr(null);
    try {
      await api.updateUiSettings({ hiddenNavPaths: Array.from(next) });
      setHidden(next);
      onSaved?.();
    } catch (e) {
      setErr((e as Error).message);
      void load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-500">{t("common.loading")}</p>;

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-gray-600">{t("admin.navViews.desc")}</p>
      {err ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      <div className="space-y-4">
        {navSections
          .filter((s) => !s.adminOnly)
          .map((section) => {
            const rows = section.items.filter((i) => (MANAGED_NAV_PATHS as readonly string[]).includes(i.to));
            if (rows.length === 0) return null;
            return (
              <div key={section.labelKey} className="rounded border border-gray-200 bg-white p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t(section.labelKey)}</h3>
                <ul className="space-y-2">
                  {rows.map((item) => {
                    const visible = !hidden.has(item.to);
                    const disableOff = visible && visibleCount <= 1;
                    return (
                      <li key={item.to} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-gray-800">{t(item.labelKey)}</span>
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={visible}
                            disabled={busy || (disableOff && visible)}
                            onChange={(e) => void setPathVisible(item.to, e.target.checked)}
                          />
                          {t("admin.navViews.visible")}
                        </label>
                        <code className="text-[10px] text-gray-400">{item.to}</code>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
      </div>
    </div>
  );
}

/* ── Domains Section ──────────────────────────────────────────────── */

function DomainsSection({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editSort, setEditSort] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [newSort, setNewSort] = useState(0);

  const load = useCallback(async () => {
    try {
      const { domains } = await api.getDomains();
      setDomains(domains);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const startEdit = (d: Domain) => {
    setEditId(d.id);
    setEditName(d.name);
    setEditColor(d.color);
    setEditSort(d.sortOrder);
  };

  const saveEdit = async () => {
    if (!editId) return;
    const { domain } = await api.updateDomain(editId, { name: editName, color: editColor, sortOrder: editSort });
    setDomains((prev) => prev.map((d) => (d.id === editId ? domain : d)));
    setEditId(null);
    onChanged?.();
  };

  const add = async () => {
    if (!newName) return;
    const { domain } = await api.createDomain({ name: newName, color: newColor, sortOrder: newSort });
    setDomains((prev) => [...prev, domain]);
    setShowAdd(false);
    setNewName("");
    setNewColor("#6366f1");
    setNewSort(0);
    onChanged?.();
  };

  const remove = async (id: string) => {
    if (!confirm(t("admin.deleteDomain"))) return;
    await api.deleteDomain(id);
    setDomains((prev) => prev.filter((d) => d.id !== id));
    onChanged?.();
  };

  if (loading) return <p className="text-sm text-gray-500">{t("admin.loadingDomains")}</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-700">{t("admin.domains")}</h3>
        <button className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? t("common.cancel") : t("common.add")}
        </button>
      </div>
      {showAdd && (
        <div className="flex flex-wrap items-end gap-3 rounded border bg-gray-50 p-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("common.name")}</label>
            <input className="rounded border px-2 py-1 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("common.color")}</label>
            <input type="color" className="h-8 w-10 cursor-pointer rounded border" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("common.sort")}</label>
            <input type="number" className="rounded border px-2 py-1 text-sm w-16" value={newSort} onChange={(e) => setNewSort(Number(e.target.value))} />
          </div>
          <button className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700" onClick={add}>{t("common.save")}</button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wider">
            <th className="py-2 px-3">{t("common.color")}</th>
            <th className="py-2 px-3">{t("common.name")}</th>
            <th className="py-2 px-3">{t("common.sort")}</th>
            <th className="py-2 px-3 text-right">{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {domains.map((d) => (
            <tr key={d.id} className="border-b hover:bg-gray-50">
              {editId === d.id ? (
                <>
                  <td className="py-2 px-3"><input type="color" className="h-6 w-8 rounded border cursor-pointer" value={editColor} onChange={(e) => setEditColor(e.target.value)} /></td>
                  <td className="py-2 px-3"><input className="rounded border px-2 py-0.5 text-sm w-full" value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
                  <td className="py-2 px-3"><input type="number" className="rounded border px-2 py-0.5 text-sm w-16" value={editSort} onChange={(e) => setEditSort(Number(e.target.value))} /></td>
                  <td className="py-2 px-3 text-right space-x-2">
                    <button className="text-green-600 text-xs hover:underline" onClick={saveEdit}>{t("common.save")}</button>
                    <button className="text-gray-400 text-xs hover:underline" onClick={() => setEditId(null)}>{t("common.cancel")}</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 px-3"><span className="inline-block h-4 w-4 rounded" style={{ backgroundColor: d.color }} /></td>
                  <td className="py-2 px-3">{d.name}</td>
                  <td className="py-2 px-3 text-gray-500">{d.sortOrder}</td>
                  <td className="py-2 px-3 text-right space-x-2">
                    <button className="text-indigo-600 text-xs hover:underline" onClick={() => startEdit(d)}>{t("common.edit")}</button>
                    <button className="text-red-500 text-xs hover:underline" onClick={() => remove(d.id)}>{t("common.delete")}</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Personas Section ─────────────────────────────────────────────── */

function PersonasSection({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editCategory, setEditCategory] = useState<PersonaCategory>("NONE");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [newCategory, setNewCategory] = useState<PersonaCategory>("NONE");

  const load = useCallback(async () => {
    try {
      const { personas } = await api.getPersonas();
      setPersonas(personas);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const startEdit = (p: Persona) => {
    setEditId(p.id);
    setEditName(p.name);
    setEditIcon(p.icon ?? "");
    setEditCategory(p.category);
  };

  const saveEdit = async () => {
    if (!editId) return;
    const { persona } = await api.updatePersona(editId, { name: editName, icon: editIcon || null, category: editCategory });
    setPersonas((prev) => prev.map((p) => (p.id === editId ? persona : p)));
    setEditId(null);
    onChanged?.();
  };

  const add = async () => {
    if (!newName) return;
    const { persona } = await api.createPersona({ name: newName, icon: newIcon || null, category: newCategory });
    setPersonas((prev) => [...prev, persona]);
    setShowAdd(false);
    setNewName("");
    setNewIcon("");
    setNewCategory("NONE");
    onChanged?.();
  };

  const remove = async (id: string) => {
    if (!confirm(t("admin.deletePersona"))) return;
    await api.deletePersona(id);
    setPersonas((prev) => prev.filter((p) => p.id !== id));
    onChanged?.();
  };

  if (loading) return <p className="text-sm text-gray-500">{t("admin.loadingPersonas")}</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-700">{t("admin.personas")}</h3>
        <button className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? t("common.cancel") : t("common.add")}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {t("admin.personaCategoryDesc")}
      </p>
      {showAdd && (
        <div className="flex flex-wrap items-end gap-3 rounded border bg-gray-50 p-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("common.name")}</label>
            <input className="rounded border px-2 py-1 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("common.icon")}</label>
            <input className="rounded border px-2 py-1 text-sm w-24" value={newIcon} onChange={(e) => setNewIcon(e.target.value)} placeholder={t("admin.iconPlaceholder")} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("common.category")}</label>
            <select className="rounded border px-2 py-1 text-sm" value={newCategory} onChange={(e) => setNewCategory(e.target.value as PersonaCategory)}>
              {PERSONA_CATEGORIES.map((c) => <option key={c} value={c}>{t(`personaCategory.${c}`)}</option>)}
            </select>
          </div>
          <button className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700" onClick={add}>{t("common.save")}</button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wider">
            <th className="py-2 px-3">{t("common.name")}</th>
            <th className="py-2 px-3">{t("common.icon")}</th>
            <th className="py-2 px-3">{t("common.category")}</th>
            <th className="py-2 px-3 text-right">{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {personas.map((p) => (
            <tr key={p.id} className="border-b hover:bg-gray-50">
              {editId === p.id ? (
                <>
                  <td className="py-2 px-3"><input className="rounded border px-2 py-0.5 text-sm w-full" value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
                  <td className="py-2 px-3"><input className="rounded border px-2 py-0.5 text-sm w-24" value={editIcon} onChange={(e) => setEditIcon(e.target.value)} /></td>
                  <td className="py-2 px-3">
                    <select className="rounded border px-2 py-0.5 text-sm" value={editCategory} onChange={(e) => setEditCategory(e.target.value as PersonaCategory)}>
                      {PERSONA_CATEGORIES.map((c) => <option key={c} value={c}>{t(`personaCategory.${c}`)}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-3 text-right space-x-2">
                    <button className="text-green-600 text-xs hover:underline" onClick={saveEdit}>{t("common.save")}</button>
                    <button className="text-gray-400 text-xs hover:underline" onClick={() => setEditId(null)}>{t("common.cancel")}</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 px-3">{p.name}</td>
                  <td className="py-2 px-3 text-gray-500">{p.icon ?? "—"}</td>
                  <td className="py-2 px-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${PERSONA_CAT_COLORS[p.category]}`}>{t(`personaCategory.${p.category}`)}</span>
                  </td>
                  <td className="py-2 px-3 text-right space-x-2">
                    <button className="text-indigo-600 text-xs hover:underline" onClick={() => startEdit(p)}>{t("common.edit")}</button>
                    <button className="text-red-500 text-xs hover:underline" onClick={() => remove(p.id)}>{t("common.delete")}</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Data Tab (Import / Export) ───────────────────────────────────── */

const EXPORT_ENTITY_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Core", keys: ["users", "products", "domains", "personas", "revenueStreams"] },
  { label: "Business", keys: ["accounts", "partners", "demands", "demandLinks"] },
  { label: "Product", keys: ["initiatives", "features", "requirements", "decisions", "risks", "dependencies"] },
  { label: "Marketing", keys: ["campaigns", "assets", "campaignLinks"] },
  { label: "Ontology", keys: ["capabilities", "capabilityBindings", "compiledBriefs"] },
];
const ALL_EXPORT_KEYS = EXPORT_ENTITY_GROUPS.flatMap((g) => g.keys);

function DataTab() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; counts?: Record<string, number> } | null>(null);
  const [confirmPayload, setConfirmPayload] = useState<Record<string, unknown> | null>(null);
  const [importMode, setImportMode] = useState<"replace" | "merge">("merge");
  const [exportEntities, setExportEntities] = useState<Set<string>>(new Set(ALL_EXPORT_KEYS));

  const toggleExportEntity = (key: string) => {
    setExportEntities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleExportGroup = (keys: string[]) => {
    setExportEntities((prev) => {
      const next = new Set(prev);
      const allSelected = keys.every((k) => next.has(k));
      for (const k of keys) {
        if (allSelected) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const isAllSelected = exportEntities.size === ALL_EXPORT_KEYS.length;

  const handleExport = async () => {
    if (exportEntities.size === 0) return;
    setExporting(true);
    setResult(null);
    try {
      const entities = isAllSelected ? undefined : [...exportEntities];
      const data = await api.exportData(entities);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dd-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setResult({ ok: true, message: t("admin.exportSuccess") });
    } catch {
      setResult({ ok: false, message: t("admin.exportFailed") });
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.version !== 1) {
        setResult({ ok: false, message: t("admin.invalidFile", { version: 1 }) });
        return;
      }
      setConfirmPayload(parsed);
      setResult(null);
    } catch {
      setResult({ ok: false, message: t("admin.parseError") });
    }
  };

  const handleImport = async () => {
    if (!confirmPayload) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await api.importData(confirmPayload, importMode);
      const reloadMsg = importMode === "replace" ? " " + t("admin.importSuccessReload") : "";
      setResult({ ok: true, message: t("admin.importSuccess") + reloadMsg, counts: res.counts });
      setConfirmPayload(null);
      if (fileRef.current) fileRef.current.value = "";
      if (importMode === "replace") {
        setTimeout(() => window.location.reload(), 3000);
      }
    } catch {
      setResult({ ok: false, message: t("admin.importFailed") });
    } finally {
      setImporting(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    setResult(null);
    try {
      const data = await api.clearData();
      setResult({ ok: true, message: data.message });
      setShowClearConfirm(false);
      setTimeout(() => window.location.reload(), 2000);
    } catch {
      setResult({ ok: false, message: t("admin.clearFailed") });
    } finally {
      setClearing(false);
    }
  };

  const payloadSummary = useMemo(() => {
    if (!confirmPayload) return null;
    const keys = [
      "users", "products", "domains", "personas", "revenueStreams", "accounts", "partners",
      "initiatives", "features", "requirements", "decisions", "risks",
      "demands", "demandLinks", "dependencies", "campaigns", "assets", "campaignLinks",
    ];
    const present: { key: string; count: number }[] = [];
    for (const k of keys) {
      if (Array.isArray(confirmPayload[k])) {
        present.push({ key: k, count: (confirmPayload[k] as unknown[]).length });
      }
    }
    return present;
  }, [confirmPayload]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">{t("admin.export")}</h3>
        <p className="text-xs text-gray-500 mb-3">
          {t("admin.exportDesc")}
        </p>
        <div className="mb-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={() => setExportEntities(isAllSelected ? new Set() : new Set(ALL_EXPORT_KEYS))}
                className="rounded"
              />
              {t("admin.entityAll")}
            </label>
          </div>
          {EXPORT_ENTITY_GROUPS.map((group) => {
            const allGroupSelected = group.keys.every((k) => exportEntities.has(k));
            const someGroupSelected = group.keys.some((k) => exportEntities.has(k));
            const groupLabelKey: Record<string, string> = {
              Core: "admin.entityCore",
              Business: "admin.entityBusiness",
              Product: "admin.entityProduct",
              Marketing: "admin.entityMarketing",
              Ontology: "admin.ontology"
            };
            return (
              <div key={group.label} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 w-20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allGroupSelected}
                    ref={(el) => { if (el) el.indeterminate = someGroupSelected && !allGroupSelected; }}
                    onChange={() => toggleExportGroup(group.keys)}
                    className="rounded"
                  />
                  {t(groupLabelKey[group.label] ?? group.label)}
                </label>
                {group.keys.map((k) => (
                  <label key={k} className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportEntities.has(k)}
                      onChange={() => toggleExportEntity(k)}
                      className="rounded"
                    />
                    <span className="capitalize">{k}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <button
          className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          onClick={handleExport}
          disabled={exporting || exportEntities.size === 0}
        >
          {exporting ? t("admin.exporting") : isAllSelected ? t("admin.exportAll") : t("admin.exportN", { count: exportEntities.size })}
        </button>
      </div>

      <div className="rounded-lg border bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">{t("admin.import")}</h3>
        <p className="text-xs text-gray-500 mb-3">
          {t("admin.importDesc")}
        </p>
        <div className="flex items-center gap-3 mb-3">
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
            onChange={handleFileSelect}
          />
        </div>

        {confirmPayload != null && (
          <div className="mt-4 space-y-4">
            {payloadSummary && payloadSummary.length > 0 && (
              <div className="rounded border bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-600 mb-2">{t("admin.fileContains")}</p>
                <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs text-gray-600">
                  {payloadSummary.map(({ key, count }) => (
                    <div key={key} className="flex justify-between">
                      <span className="capitalize">{key}</span>
                      <span className="font-mono">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <label className={`flex items-center gap-2 rounded border px-4 py-3 cursor-pointer text-sm ${importMode === "merge" ? "border-indigo-400 bg-indigo-50" : "border-gray-200"}`}>
                <input type="radio" name="importMode" value="merge" checked={importMode === "merge"} onChange={() => setImportMode("merge")} />
                <div>
                  <span className="font-medium">{t("admin.merge")}</span>
                  <p className="text-xs text-gray-500">{t("admin.mergeDesc")}</p>
                </div>
              </label>
              <label className={`flex items-center gap-2 rounded border px-4 py-3 cursor-pointer text-sm ${importMode === "replace" ? "border-red-400 bg-red-50" : "border-gray-200"}`}>
                <input type="radio" name="importMode" value="replace" checked={importMode === "replace"} onChange={() => setImportMode("replace")} />
                <div>
                  <span className="font-medium text-red-700">{t("admin.replace")}</span>
                  <p className="text-xs text-gray-500">{t("admin.replaceDesc")}</p>
                </div>
              </label>
            </div>

            <div className={`rounded border p-4 ${importMode === "replace" ? "border-red-300 bg-red-50" : "border-indigo-300 bg-indigo-50"}`}>
              <p className={`text-sm font-medium mb-2 ${importMode === "replace" ? "text-red-800" : "text-indigo-800"}`}>
                {importMode === "replace"
                  ? t("admin.replaceWarning")
                  : t("admin.mergeWarning")}
              </p>
              <div className="flex gap-2">
                <button
                  className={`rounded px-4 py-2 text-sm text-white disabled:opacity-50 ${importMode === "replace" ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
                  onClick={handleImport}
                  disabled={importing}
                >
                  {importing ? t("admin.importing") : importMode === "replace" ? t("admin.replaceConfirm") : t("admin.mergeConfirm")}
                </button>
                <button
                  className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  onClick={() => { setConfirmPayload(null); if (fileRef.current) fileRef.current.value = ""; }}
                  disabled={importing}
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-red-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-red-700 mb-1">{t("admin.clearAllData")}</h3>
        <p className="text-xs text-gray-500 mb-3">
          {t("admin.clearDesc")}
        </p>
        {!showClearConfirm ? (
          <button
            className="rounded border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            onClick={() => { setShowClearConfirm(true); setResult(null); }}
          >
            {t("admin.clearButton")}
          </button>
        ) : (
          <div className="rounded border border-red-300 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800 mb-2">
              {t("admin.clearWarning")}
            </p>
            <div className="flex gap-2">
              <button
                className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                onClick={handleClear}
                disabled={clearing}
              >
                {clearing ? t("admin.clearing") : t("admin.clearConfirm")}
              </button>
              <button
                className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className={`rounded-lg border p-4 ${result.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
          <p className={`text-sm font-medium ${result.ok ? "text-green-800" : "text-red-800"}`}>{result.message}</p>
          {result.counts && (
            <div className="mt-2 grid grid-cols-3 gap-x-6 gap-y-1 text-xs text-green-700">
              {Object.entries(result.counts).map(([key, count]) => (
                <div key={key} className="flex justify-between">
                  <span className="capitalize">{key}</span>
                  <span className="font-mono">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Revenue Streams Section ──────────────────────────────────────── */

function RevenueStreamsSection({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation();
  const [streams, setStreams] = useState<RevenueStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#10b981");

  const load = useCallback(async () => {
    try {
      const { revenueStreams } = await api.getRevenueStreams();
      setStreams(revenueStreams);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const startEdit = (s: RevenueStream) => {
    setEditId(s.id);
    setEditName(s.name);
    setEditColor(s.color);
  };

  const saveEdit = async () => {
    if (!editId) return;
    const { revenueStream } = await api.updateRevenueStream(editId, { name: editName, color: editColor });
    setStreams((prev) => prev.map((s) => (s.id === editId ? revenueStream : s)));
    setEditId(null);
    onChanged?.();
  };

  const add = async () => {
    if (!newName) return;
    const { revenueStream } = await api.createRevenueStream({ name: newName, color: newColor });
    setStreams((prev) => [...prev, revenueStream]);
    setShowAdd(false);
    setNewName("");
    setNewColor("#10b981");
    onChanged?.();
  };

  const remove = async (id: string) => {
    if (!confirm(t("admin.deleteStream"))) return;
    await api.deleteRevenueStream(id);
    setStreams((prev) => prev.filter((s) => s.id !== id));
    onChanged?.();
  };

  if (loading) return <p className="text-sm text-gray-500">{t("admin.loadingStreams")}</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-700">{t("admin.revenueStreams")}</h3>
        <button className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? t("common.cancel") : t("common.add")}
        </button>
      </div>
      {showAdd && (
        <div className="flex flex-wrap items-end gap-3 rounded border bg-gray-50 p-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("common.name")}</label>
            <input className="rounded border px-2 py-1 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("common.color")}</label>
            <input type="color" className="h-8 w-10 cursor-pointer rounded border" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
          </div>
          <button className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700" onClick={add}>{t("common.save")}</button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wider">
            <th className="py-2 px-3">{t("common.color")}</th>
            <th className="py-2 px-3">{t("common.name")}</th>
            <th className="py-2 px-3 text-right">{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {streams.map((s) => (
            <tr key={s.id} className="border-b hover:bg-gray-50">
              {editId === s.id ? (
                <>
                  <td className="py-2 px-3"><input type="color" className="h-6 w-8 rounded border cursor-pointer" value={editColor} onChange={(e) => setEditColor(e.target.value)} /></td>
                  <td className="py-2 px-3"><input className="rounded border px-2 py-0.5 text-sm w-full" value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
                  <td className="py-2 px-3 text-right space-x-2">
                    <button className="text-green-600 text-xs hover:underline" onClick={saveEdit}>{t("common.save")}</button>
                    <button className="text-gray-400 text-xs hover:underline" onClick={() => setEditId(null)}>{t("common.cancel")}</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 px-3"><span className="inline-block h-4 w-4 rounded" style={{ backgroundColor: s.color }} /></td>
                  <td className="py-2 px-3">{s.name}</td>
                  <td className="py-2 px-3 text-right space-x-2">
                    <button className="text-indigo-600 text-xs hover:underline" onClick={() => startEdit(s)}>{t("common.edit")}</button>
                    <button className="text-red-500 text-xs hover:underline" onClick={() => remove(s.id)}>{t("common.delete")}</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
