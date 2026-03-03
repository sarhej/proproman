import { useCallback, useEffect, useMemo, useState } from "react";
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

export function AdminPage({ currentUser, quickFilter }: { currentUser: User; quickFilter?: string }) {
  const [tab, setTab] = useState<"users" | "activity">("users");

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b">
        <button
          className={`px-4 py-2 -mb-px text-sm font-medium ${tab === "users" ? "border-b-2 border-indigo-600 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
          onClick={() => setTab("users")}
        >
          Users
        </button>
        <button
          className={`px-4 py-2 -mb-px text-sm font-medium ${tab === "activity" ? "border-b-2 border-indigo-600 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
          onClick={() => setTab("activity")}
        >
          Activity
        </button>
      </div>
      {tab === "users" ? <UsersTab currentUser={currentUser} quickFilter={quickFilter} /> : <ActivityTab quickFilter={quickFilter} />}
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
