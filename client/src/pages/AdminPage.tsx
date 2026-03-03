import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type { AuditEntry, Domain, Persona, PersonaCategory, RevenueStream, User, UserRole } from "../types/models";

const ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "EDITOR", "MARKETING", "VIEWER"];
const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800",
  ADMIN: "bg-blue-100 text-blue-800",
  EDITOR: "bg-green-100 text-green-800",
  MARKETING: "bg-orange-100 text-orange-800",
  VIEWER: "bg-gray-100 text-gray-700"
};

function formatDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

type Tab = "users" | "activity" | "settings" | "data";

export function AdminPage({ currentUser, quickFilter, onMetaChanged }: { currentUser: User; quickFilter?: string; onMetaChanged?: () => void }) {
  const [tab, setTab] = useState<Tab>("users");

  const tabs: { key: Tab; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "settings", label: "Settings" },
    { key: "data", label: "Data" },
    { key: "activity", label: "Activity" }
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`px-4 py-2 -mb-px text-sm font-medium ${tab === t.key ? "border-b-2 border-indigo-600 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "users" && <UsersTab currentUser={currentUser} quickFilter={quickFilter} />}
      {tab === "settings" && <SettingsTab onMetaChanged={onMetaChanged} />}
      {tab === "data" && <DataTab />}
      {tab === "activity" && <ActivityTab quickFilter={quickFilter} />}
    </div>
  );
}

function UsersTab({ currentUser, quickFilter }: { currentUser: User; quickFilter?: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("VIEWER");

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

  const availableRoles = currentUser.role === "SUPER_ADMIN" ? ROLES : ROLES.filter((r) => r !== "SUPER_ADMIN");

  const filteredUsers = useMemo(() => {
    const q = quickFilter?.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = [u.name, u.email, u.role].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [quickFilter, users]);

  if (loading) return <p className="text-sm text-gray-500">Loading users...</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Cancel" : "+ Add user"}
        </button>
      </div>

      {showAdd && (
        <div className="flex flex-wrap items-end gap-3 rounded border bg-gray-50 p-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input className="rounded border px-2 py-1 text-sm" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input className="rounded border px-2 py-1 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <select className="rounded border px-2 py-1 text-sm" value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
              {availableRoles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700" onClick={addUser}>Save</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="py-2 px-3">Name</th>
              <th className="py-2 px-3">Email</th>
              <th className="py-2 px-3">Role</th>
              <th className="py-2 px-3 text-center">Active</th>
              <th className="py-2 px-3">Last Login</th>
              <th className="py-2 px-3 text-center">Google</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 flex items-center gap-2">
                  {u.avatarUrl && <img src={u.avatarUrl} alt="" className="h-6 w-6 rounded-full" />}
                  <span>{u.name}</span>
                </td>
                <td className="py-2 px-3 text-gray-600">{u.email}</td>
                <td className="py-2 px-3">
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
                </td>
                <td className="py-2 px-3 text-center">
                  <button
                    className={`rounded px-2 py-0.5 text-xs font-medium ${u.isActive !== false ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                    onClick={() => updateField(u.id, { isActive: !(u.isActive !== false) })}
                    disabled={u.id === currentUser.id}
                  >
                    {u.isActive !== false ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="py-2 px-3 text-gray-500 text-xs">{formatDate(u.lastLoginAt)}</td>
                <td className="py-2 px-3 text-center">
                  {u.googleId ? (
                    <span className="text-green-600 text-xs font-medium">Linked</span>
                  ) : (
                    <span className="text-amber-500 text-xs font-medium">Unlinked</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActivityTab({ quickFilter }: { quickFilter?: string }) {
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
          <option value="">All actions</option>
          {["CREATED", "UPDATED", "DELETED", "STATUS_CHANGED", "ROLE_CHANGED", "LOGIN"].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select className="rounded border px-2 py-1 text-sm" value={filterEntity} onChange={(e) => { setFilterEntity(e.target.value); setPage(1); }}>
          <option value="">All entities</option>
          {["USER", "INITIATIVE", "FEATURE", "CAMPAIGN"].map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading activity...</p>
      ) : filteredEntries.length === 0 ? (
        <p className="text-sm text-gray-500">No activity found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="py-2 px-3">Time</th>
                <th className="py-2 px-3">User</th>
                <th className="py-2 px-3">Action</th>
                <th className="py-2 px-3">Entity</th>
                <th className="py-2 px-3">Details</th>
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
          <span className="text-gray-500">{total} entries</span>
          <div className="flex gap-2">
            <button
              className="rounded border px-3 py-1 text-sm disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="py-1 text-gray-600">Page {page} / {totalPages}</span>
            <button
              className="rounded border px-3 py-1 text-sm disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
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

function SettingsTab({ onMetaChanged }: { onMetaChanged?: () => void }) {
  const [section, setSection] = useState<"domains" | "personas" | "revenue">("domains");
  const sections: { key: typeof section; label: string }[] = [
    { key: "domains", label: "Domains" },
    { key: "personas", label: "Personas" },
    { key: "revenue", label: "Revenue Streams" }
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
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
    </div>
  );
}

/* ── Domains Section ──────────────────────────────────────────────── */

function DomainsSection({ onChanged }: { onChanged?: () => void }) {
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
    if (!confirm("Delete this domain? Initiatives using it will lose their domain.")) return;
    await api.deleteDomain(id);
    setDomains((prev) => prev.filter((d) => d.id !== id));
    onChanged?.();
  };

  if (loading) return <p className="text-sm text-gray-500">Loading domains...</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-700">Domains</h3>
        <button className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Cancel" : "+ Add"}
        </button>
      </div>
      {showAdd && (
        <div className="flex flex-wrap items-end gap-3 rounded border bg-gray-50 p-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input className="rounded border px-2 py-1 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Color</label>
            <input type="color" className="h-8 w-10 cursor-pointer rounded border" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sort</label>
            <input type="number" className="rounded border px-2 py-1 text-sm w-16" value={newSort} onChange={(e) => setNewSort(Number(e.target.value))} />
          </div>
          <button className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700" onClick={add}>Save</button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wider">
            <th className="py-2 px-3">Color</th>
            <th className="py-2 px-3">Name</th>
            <th className="py-2 px-3">Sort</th>
            <th className="py-2 px-3 text-right">Actions</th>
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
                    <button className="text-green-600 text-xs hover:underline" onClick={saveEdit}>Save</button>
                    <button className="text-gray-400 text-xs hover:underline" onClick={() => setEditId(null)}>Cancel</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 px-3"><span className="inline-block h-4 w-4 rounded" style={{ backgroundColor: d.color }} /></td>
                  <td className="py-2 px-3">{d.name}</td>
                  <td className="py-2 px-3 text-gray-500">{d.sortOrder}</td>
                  <td className="py-2 px-3 text-right space-x-2">
                    <button className="text-indigo-600 text-xs hover:underline" onClick={() => startEdit(d)}>Edit</button>
                    <button className="text-red-500 text-xs hover:underline" onClick={() => remove(d.id)}>Delete</button>
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
    if (!confirm("Delete this persona? Impact data using it will be removed.")) return;
    await api.deletePersona(id);
    setPersonas((prev) => prev.filter((p) => p.id !== id));
    onChanged?.();
  };

  if (loading) return <p className="text-sm text-gray-500">Loading personas...</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-700">Personas</h3>
        <button className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Cancel" : "+ Add"}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Category determines grouping in the Buyer x User chart. <strong>BUYER</strong> = horizontal axis, <strong>USER</strong> = vertical axis, <strong>NONE</strong> = excluded from chart.
      </p>
      {showAdd && (
        <div className="flex flex-wrap items-end gap-3 rounded border bg-gray-50 p-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input className="rounded border px-2 py-1 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Icon</label>
            <input className="rounded border px-2 py-1 text-sm w-24" value={newIcon} onChange={(e) => setNewIcon(e.target.value)} placeholder="e.g. heart" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Category</label>
            <select className="rounded border px-2 py-1 text-sm" value={newCategory} onChange={(e) => setNewCategory(e.target.value as PersonaCategory)}>
              {PERSONA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700" onClick={add}>Save</button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wider">
            <th className="py-2 px-3">Name</th>
            <th className="py-2 px-3">Icon</th>
            <th className="py-2 px-3">Category</th>
            <th className="py-2 px-3 text-right">Actions</th>
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
                      {PERSONA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-3 text-right space-x-2">
                    <button className="text-green-600 text-xs hover:underline" onClick={saveEdit}>Save</button>
                    <button className="text-gray-400 text-xs hover:underline" onClick={() => setEditId(null)}>Cancel</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 px-3">{p.name}</td>
                  <td className="py-2 px-3 text-gray-500">{p.icon ?? "—"}</td>
                  <td className="py-2 px-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${PERSONA_CAT_COLORS[p.category]}`}>{p.category}</span>
                  </td>
                  <td className="py-2 px-3 text-right space-x-2">
                    <button className="text-indigo-600 text-xs hover:underline" onClick={() => startEdit(p)}>Edit</button>
                    <button className="text-red-500 text-xs hover:underline" onClick={() => remove(p.id)}>Delete</button>
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

function DataTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; counts?: Record<string, number> } | null>(null);
  const [confirmPayload, setConfirmPayload] = useState<unknown>(null);

  const handleExport = async () => {
    setExporting(true);
    setResult(null);
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dd-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setResult({ ok: true, message: "Export downloaded successfully." });
    } catch {
      setResult({ ok: false, message: "Export failed. Check the console for details." });
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
        setResult({ ok: false, message: "Invalid file: expected version 1." });
        return;
      }
      setConfirmPayload(parsed);
      setResult(null);
    } catch {
      setResult({ ok: false, message: "Failed to parse JSON file." });
    }
  };

  const handleImport = async () => {
    if (!confirmPayload) return;
    setImporting(true);
    setResult(null);
    try {
      const { counts } = await api.importData(confirmPayload);
      setResult({ ok: true, message: "Import completed successfully. The page will reload so you can re-authenticate.", counts });
      setConfirmPayload(null);
      if (fileRef.current) fileRef.current.value = "";
      setTimeout(() => window.location.reload(), 3000);
    } catch {
      setResult({ ok: false, message: "Import failed. Transaction was rolled back. No data was changed." });
    } finally {
      setImporting(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    setResult(null);
    try {
      const data = await api.clearData();
      setResult({ ok: true, message: data.message + " The page will reload." });
      setShowClearConfirm(false);
      setTimeout(() => window.location.reload(), 2000);
    } catch {
      setResult({ ok: false, message: "Clear failed. Transaction was rolled back." });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Export</h3>
        <p className="text-xs text-gray-500 mb-3">
          Download all application data (users, products, domains, initiatives, features, etc.) as a single JSON file.
          Use this to back up data or transfer it to another environment.
        </p>
        <button
          className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? "Exporting..." : "Export All Data"}
        </button>
      </div>

      <div className="rounded-lg border bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Import</h3>
        <p className="text-xs text-gray-500 mb-3">
          Upload a previously exported JSON file to replace all existing data.
          This is a destructive operation — all current data will be wiped and replaced.
        </p>
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
            onChange={handleFileSelect}
          />
        </div>

        {confirmPayload != null && (
          <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800 mb-2">
              Are you sure you want to import this data?
            </p>
            <p className="text-xs text-amber-700 mb-3">
              This will permanently delete all existing data (users, initiatives, features, campaigns, etc.)
              and replace it with the contents of the uploaded file. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? "Importing..." : "Yes, Replace All Data"}
              </button>
              <button
                className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                onClick={() => { setConfirmPayload(null); if (fileRef.current) fileRef.current.value = ""; }}
                disabled={importing}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-red-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-red-700 mb-1">Clear All Data</h3>
        <p className="text-xs text-gray-500 mb-3">
          Delete all application data (initiatives, features, campaigns, accounts, etc.) and start fresh.
          Your own user account will be preserved so you stay logged in.
        </p>
        {!showClearConfirm ? (
          <button
            className="rounded border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            onClick={() => { setShowClearConfirm(true); setResult(null); }}
          >
            Clear All Data...
          </button>
        ) : (
          <div className="rounded border border-red-300 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800 mb-2">
              This will permanently delete everything except your user account.
            </p>
            <div className="flex gap-2">
              <button
                className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                onClick={handleClear}
                disabled={clearing}
              >
                {clearing ? "Clearing..." : "Yes, Delete Everything"}
              </button>
              <button
                className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
              >
                Cancel
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
    if (!confirm("Delete this revenue stream?")) return;
    await api.deleteRevenueStream(id);
    setStreams((prev) => prev.filter((s) => s.id !== id));
    onChanged?.();
  };

  if (loading) return <p className="text-sm text-gray-500">Loading revenue streams...</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-700">Revenue Streams</h3>
        <button className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Cancel" : "+ Add"}
        </button>
      </div>
      {showAdd && (
        <div className="flex flex-wrap items-end gap-3 rounded border bg-gray-50 p-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input className="rounded border px-2 py-1 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Color</label>
            <input type="color" className="h-8 w-10 cursor-pointer rounded border" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
          </div>
          <button className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700" onClick={add}>Save</button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wider">
            <th className="py-2 px-3">Color</th>
            <th className="py-2 px-3">Name</th>
            <th className="py-2 px-3 text-right">Actions</th>
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
                    <button className="text-green-600 text-xs hover:underline" onClick={saveEdit}>Save</button>
                    <button className="text-gray-400 text-xs hover:underline" onClick={() => setEditId(null)}>Cancel</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 px-3"><span className="inline-block h-4 w-4 rounded" style={{ backgroundColor: s.color }} /></td>
                  <td className="py-2 px-3">{s.name}</td>
                  <td className="py-2 px-3 text-right space-x-2">
                    <button className="text-indigo-600 text-xs hover:underline" onClick={() => startEdit(s)}>Edit</button>
                    <button className="text-red-500 text-xs hover:underline" onClick={() => remove(s.id)}>Delete</button>
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
