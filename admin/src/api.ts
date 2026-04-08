const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error((body as { error?: string }).error ?? response.statusText);
    (err as Error & { status: number }).status = response.status;
    throw err;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type TenantRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export type TenantStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "DEPROVISIONING";

export type TenantRequest = {
  id: string;
  teamName: string;
  slug: string;
  contactEmail: string;
  contactName: string;
  message?: string | null;
  status: TenantRequestStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  tenantId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  /** Reserved Tymio product workspace — cannot delete or change slug / suspend */
  isSystem?: boolean;
};

export type TenantDetail = Tenant & {
  memberships: Array<{
    id: string;
    userId: string;
    role: string;
    user: { id: string; email: string; name: string; avatarUrl?: string | null };
  }>;
};

export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: string;
};

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "MARKETING" | "VIEWER" | "PENDING";

export const api = {
  getMe: () =>
    request<{ user: User; activeTenant?: Tenant | null }>("/api/auth/me"),

  logout: () =>
    request<void>("/api/auth/logout", { method: "POST" }),

  devLogin: (role: string, tenantId?: string) =>
    request<{ user: User }>("/api/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ role, tenantId }),
    }),

  getDevTenants: () =>
    request<{ tenants: Tenant[] }>("/api/auth/dev-tenants"),

  getTenantRequests: (status?: string) =>
    request<{ requests: TenantRequest[] }>(
      `/api/tenant-requests${status ? `?status=${status}` : ""}`
    ),

  getTenantRequestDetail: (id: string) =>
    request<TenantRequest>(`/api/tenant-requests/${id}`),

  reviewTenantRequest: (id: string, body: { action: "approve" | "reject"; reviewNote?: string }) =>
    request<TenantRequest | { request: TenantRequest; tenant: Tenant }>(
      `/api/tenant-requests/${id}/review`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  getAdminTenants: () =>
    request<Tenant[]>("/api/tenants"),

  getAdminTenant: (id: string) =>
    request<TenantDetail>(`/api/tenants/${id}`),

  updateAdminTenant: (id: string, body: { name?: string; status?: string; slug?: string }) =>
    request<Tenant>(`/api/tenants/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  addTenantMember: (tenantId: string, body: { userId: string; role?: string }) =>
    request<unknown>(`/api/tenants/${tenantId}/members`, { method: "POST", body: JSON.stringify(body) }),

  removeTenantMember: (tenantId: string, userId: string) =>
    request<{ ok: boolean }>(`/api/tenants/${tenantId}/members/${userId}`, { method: "DELETE" }),

  deleteAdminTenant: (id: string) =>
    request<void>(`/api/tenants/${id}`, { method: "DELETE" }),

  getTenantWorkspaceSettings: (tenantId: string) =>
    request<{
      managedNavPaths: string[];
      enabledLocales: string[];
      hiddenNavPaths: string[];
      globalHiddenNavPaths: string[];
      tenantHiddenNavPaths: string[];
    }>(`/api/tenants/${tenantId}/workspace-settings`),

  patchTenantWorkspaceLanguages: (tenantId: string, body: { enabledLocales: string[] }) =>
    request<{ enabledLocales: string[] }>(`/api/tenants/${tenantId}/workspace-settings/languages`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  putTenantWorkspaceNavVisibility: (tenantId: string, body: { hiddenNavPaths: string[] }) =>
    request<{
      hiddenNavPaths: string[];
      globalHiddenNavPaths: string[];
      tenantHiddenNavPaths: string[];
    }>(`/api/tenants/${tenantId}/workspace-settings/nav-visibility`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};
