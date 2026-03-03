import type {
  Asset,
  AuditEntry,
  Campaign,
  CampaignLink,
  Decision,
  Demand,
  Feature,
  GanttTask,
  Initiative,
  InitiativeAssignment,
  Partner,
  Product,
  ProductWithHierarchy,
  MetaPayload,
  CalendarItem,
  Requirement,
  Risk,
  User,
  UserRole,
  Account
} from "../types/models";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  getMe: async () => request<{ user: User | null }>("/api/auth/me"),
  devLogin: async (role?: UserRole) =>
    request<{ user: User }>("/api/auth/dev-login", { method: "POST", body: JSON.stringify(role ? { role } : {}) }),
  logout: async () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  getMeta: async () => request<MetaPayload>("/api/meta"),
  getInitiatives: async (query: URLSearchParams) =>
    request<{ initiatives: Initiative[] }>(`/api/initiatives?${query.toString()}`),
  getInitiative: async (id: string) => request<{ initiative: Initiative }>(`/api/initiatives/${id}`),
  createInitiative: async (body: unknown) =>
    request<{ initiative: Initiative }>("/api/initiatives", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateInitiative: async (id: string, body: unknown) =>
    request<{ initiative: Initiative }>(`/api/initiatives/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  deleteInitiative: async (id: string) =>
    request<void>(`/api/initiatives/${id}`, {
      method: "DELETE"
    }),
  reorderInitiatives: async (rows: Array<{ id: string; domainId: string; sortOrder: number }>) =>
    request<{ ok: boolean }>("/api/initiatives/reorder", {
      method: "POST",
      body: JSON.stringify(rows)
    }),
  createFeature: async (initiativeId: string, body: unknown) =>
    request<{ feature: Feature }>(`/api/features/${initiativeId}`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateFeature: async (id: string, body: unknown) =>
    request<{ feature: Feature }>(`/api/features/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  deleteFeature: async (id: string) =>
    request<void>(`/api/features/${id}`, {
      method: "DELETE"
    }),
  createDecision: async (initiativeId: string, body: unknown) =>
    request<{ decision: Decision }>(`/api/decisions/${initiativeId}`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  deleteDecision: async (id: string) =>
    request<void>(`/api/decisions/${id}`, {
      method: "DELETE"
    }),
  createRisk: async (initiativeId: string, body: unknown) =>
    request<{ risk: Risk }>(`/api/risks/${initiativeId}`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  deleteRisk: async (id: string) =>
    request<void>(`/api/risks/${id}`, {
      method: "DELETE"
    }),
  createDependency: async (body: unknown) =>
    request<{ dependency: { fromInitiativeId: string; toInitiativeId: string } }>("/api/dependencies", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  deleteDependency: async (body: unknown) =>
    request<void>("/api/dependencies", {
      method: "DELETE",
      body: JSON.stringify(body)
    }),
  getProducts: async () => request<{ products: ProductWithHierarchy[] }>("/api/products"),
  createProduct: async (body: unknown) =>
    request<{ product: Product }>("/api/products", { method: "POST", body: JSON.stringify(body) }),
  updateProduct: async (id: string, body: unknown) =>
    request<{ product: Product }>(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProduct: async (id: string) => request<void>(`/api/products/${id}`, { method: "DELETE" }),
  getAccounts: async () => request<{ accounts: Account[] }>("/api/accounts"),
  createAccount: async (body: unknown) =>
    request<{ account: Account }>("/api/accounts", { method: "POST", body: JSON.stringify(body) }),
  updateAccount: async (id: string, body: unknown) =>
    request<{ account: Account }>(`/api/accounts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAccount: async (id: string) => request<void>(`/api/accounts/${id}`, { method: "DELETE" }),
  getPartners: async () => request<{ partners: Partner[] }>("/api/partners"),
  createPartner: async (body: unknown) =>
    request<{ partner: Partner }>("/api/partners", { method: "POST", body: JSON.stringify(body) }),
  updatePartner: async (id: string, body: unknown) =>
    request<{ partner: Partner }>(`/api/partners/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deletePartner: async (id: string) => request<void>(`/api/partners/${id}`, { method: "DELETE" }),
  getDemands: async () => request<{ demands: Demand[] }>("/api/demands"),
  createDemand: async (body: unknown) =>
    request<{ demand: Demand }>("/api/demands", { method: "POST", body: JSON.stringify(body) }),
  updateDemand: async (id: string, body: unknown) =>
    request<{ demand: Demand }>(`/api/demands/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteDemand: async (id: string) => request<void>(`/api/demands/${id}`, { method: "DELETE" }),
  getRequirements: async (featureId?: string) =>
    request<{ requirements: Requirement[] }>(`/api/requirements${featureId ? `?featureId=${featureId}` : ""}`),
  createRequirement: async (body: unknown) =>
    request<{ requirement: Requirement }>("/api/requirements", { method: "POST", body: JSON.stringify(body) }),
  updateRequirement: async (id: string, body: unknown) =>
    request<{ requirement: Requirement }>(`/api/requirements/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteRequirement: async (id: string) => request<void>(`/api/requirements/${id}`, { method: "DELETE" }),
  getAssignments: async (initiativeId?: string) =>
    request<{ assignments: InitiativeAssignment[] }>(`/api/assignments${initiativeId ? `?initiativeId=${initiativeId}` : ""}`),
  addAssignment: async (body: unknown) =>
    request<{ assignment: InitiativeAssignment }>("/api/assignments", { method: "POST", body: JSON.stringify(body) }),
  removeAssignment: async (body: unknown) =>
    request<void>("/api/assignments", { method: "DELETE", body: JSON.stringify(body) }),
  getCalendar: async () => request<{ items: CalendarItem[] }>("/api/timeline/calendar"),
  getGantt: async () => request<{ tasks: GanttTask[] }>("/api/timeline/gantt"),

  getCampaigns: async () => request<{ campaigns: Campaign[] }>("/api/campaigns"),
  getCampaign: async (id: string) => request<{ campaign: Campaign }>(`/api/campaigns/${id}`),
  createCampaign: async (body: unknown) =>
    request<{ campaign: Campaign }>("/api/campaigns", { method: "POST", body: JSON.stringify(body) }),
  updateCampaign: async (id: string, body: unknown) =>
    request<{ campaign: Campaign }>(`/api/campaigns/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteCampaign: async (id: string) => request<void>(`/api/campaigns/${id}`, { method: "DELETE" }),

  getAssets: async (campaignId?: string) =>
    request<{ assets: Asset[] }>(`/api/assets${campaignId ? `?campaignId=${campaignId}` : ""}`),
  createAsset: async (body: unknown) =>
    request<{ asset: Asset }>("/api/assets", { method: "POST", body: JSON.stringify(body) }),
  updateAsset: async (id: string, body: unknown) =>
    request<{ asset: Asset }>(`/api/assets/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAsset: async (id: string) => request<void>(`/api/assets/${id}`, { method: "DELETE" }),

  getCampaignLinks: async (campaignId?: string) =>
    request<{ links: CampaignLink[] }>(`/api/campaign-links${campaignId ? `?campaignId=${campaignId}` : ""}`),
  createCampaignLink: async (body: unknown) =>
    request<{ link: CampaignLink }>("/api/campaign-links", { method: "POST", body: JSON.stringify(body) }),
  deleteCampaignLink: async (id: string) => request<void>(`/api/campaign-links/${id}`, { method: "DELETE" }),

  getUsers: async () => request<{ users: User[] }>("/api/admin/users"),
  updateUser: async (id: string, body: unknown) =>
    request<{ user: User }>(`/api/admin/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  createUser: async (body: { email: string; name: string; role: UserRole }) =>
    request<{ user: User }>("/api/admin/users", { method: "POST", body: JSON.stringify(body) }),
  getAuditLog: async (params?: URLSearchParams) =>
    request<{ entries: AuditEntry[]; total: number; page: number; limit: number }>(
      `/api/admin/audit${params ? `?${params.toString()}` : ""}`
    )
};
