import type {
  Asset,
  AuditEntry,
  Campaign,
  CampaignLink,
  Decision,
  Demand,
  Domain,
  Feature,
  GanttTask,
  Initiative,
  InitiativeAssignment,
  InitiativeComment,
  InitiativeMilestone,
  SuccessCriterion,
  InitiativeKPI,
  Stakeholder,
  Partner,
  Persona,
  Product,
  ProductWithHierarchy,
  MetaPayload,
  CalendarItem,
  RevenueStream,
  Requirement,
  Risk,
  User,
  UserEmail,
  UserMessage,
  UserRole,
  Account,
  NotificationRule,
  UserNotificationSubscription
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
    let body: { error?: string } | undefined;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const err = new Error(
      response.status === 503 ? "Service temporarily unavailable. Please try again later." : (body?.error ?? `Request failed: ${response.status}`)
    ) as Error & { status?: number; body?: unknown };
    err.status = response.status;
    err.body = body;
    throw err;
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
  getMessages: async (unreadOnly?: boolean) =>
    request<{ messages: UserMessage[]; unreadCount: number }>(`/api/messages${unreadOnly ? "?unreadOnly=true" : ""}`),
  markMessageRead: async (id: string) =>
    request<{ message: UserMessage }>(`/api/messages/${id}/read`, { method: "PATCH" }),
  getInitiatives: async (query: URLSearchParams) =>
    request<{ initiatives: Initiative[] }>(`/api/initiatives?${query.toString()}`),
  getInitiative: async (id: string) => request<{ initiative: Initiative }>(`/api/initiatives/${id}`),
  getInitiativeComments: async (initiativeId: string) =>
    request<{ comments: InitiativeComment[] }>(`/api/initiatives/${initiativeId}/comments`),
  createInitiativeComment: async (initiativeId: string, body: { text: string }) =>
    request<{ comment: InitiativeComment }>(`/api/initiatives/${initiativeId}/comments`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  getSuccessCriteria: async (initiativeId: string) =>
    request<{ successCriteria: SuccessCriterion[] }>(`/api/initiatives/${initiativeId}/success-criteria`),
  createSuccessCriterion: async (initiativeId: string, body: { title: string; sortOrder?: number }) =>
    request<{ successCriterion: SuccessCriterion }>(`/api/initiatives/${initiativeId}/success-criteria`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateSuccessCriterion: async (initiativeId: string, criterionId: string, body: { title?: string; isDone?: boolean; sortOrder?: number }) =>
    request<{ successCriterion: SuccessCriterion }>(`/api/initiatives/${initiativeId}/success-criteria/${criterionId}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  deleteSuccessCriterion: async (initiativeId: string, criterionId: string) =>
    request<void>(`/api/initiatives/${initiativeId}/success-criteria/${criterionId}`, {
      method: "DELETE"
    }),
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
  archiveInitiative: async (id: string) =>
    request<{ initiative: Initiative }>(`/api/initiatives/${id}/archive`, {
      method: "PATCH"
    }),
  unarchiveInitiative: async (id: string) =>
    request<{ initiative: Initiative }>(`/api/initiatives/${id}/unarchive`, {
      method: "PATCH"
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
  addUserEmail: async (userId: string, email: string) =>
    request<{ email: UserEmail }>(`/api/admin/users/${userId}/emails`, { method: "POST", body: JSON.stringify({ email }) }),
  removeUserEmail: async (userId: string, emailId: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${userId}/emails/${emailId}`, { method: "DELETE" }),
  deleteUser: async (id: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}`, { method: "DELETE" }),
  getAuditLog: async (params?: URLSearchParams) =>
    request<{ entries: AuditEntry[]; total: number; page: number; limit: number }>(
      `/api/admin/audit${params ? `?${params.toString()}` : ""}`
    ),
  getNotificationRules: async () =>
    request<{ rules: NotificationRule[] }>("/api/admin/notification-rules"),
  createNotificationRule: async (body: {
    action: string;
    entityType: string;
    eventKind?: string | null;
    recipientKind: string;
    recipientRole?: string | null;
    deliveryChannels?: string[];
    enabled?: boolean;
  }) =>
    request<{ rule: NotificationRule }>("/api/admin/notification-rules", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateNotificationRule: async (id: string, body: Partial<{
    action: string;
    entityType: string;
    eventKind: string | null;
    recipientKind: string;
    recipientRole: string | null;
    deliveryChannels: string[];
    enabled: boolean;
  }>) =>
    request<{ rule: NotificationRule }>(`/api/admin/notification-rules/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteNotificationRule: async (id: string) =>
    request<void>(`/api/admin/notification-rules/${id}`, { method: "DELETE" }),

  getNotificationSubscriptions: async () =>
    request<{ subscriptions: UserNotificationSubscription[] }>("/api/notification-subscriptions"),
  createNotificationSubscription: async (body: {
    action: string;
    entityType: string;
    scopeType: string;
    scopeId?: string | null;
    deliveryChannels?: string[];
  }) =>
    request<{ subscription: UserNotificationSubscription }>("/api/notification-subscriptions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteNotificationSubscription: async (id: string) =>
    request<void>(`/api/notification-subscriptions/${id}`, { method: "DELETE" }),

  getNotificationPreferences: async () =>
    request<{ preferences: { channel: string; enabled: boolean; channelIdentifier: string | null }[] }>("/api/me/notification-preferences"),
  updateNotificationPreferences: async (preferences: { channel: string; enabled: boolean; channelIdentifier?: string | null }[]) =>
    request<{ preferences: { channel: string; enabled: boolean; channelIdentifier: string | null }[] }>("/api/me/notification-preferences", {
      method: "PATCH",
      body: JSON.stringify({ preferences }),
    }),

  getAllMilestones: async () =>
    request<{ milestones: (InitiativeMilestone & { initiative: { id: string; title: string; domain: { id: string; name: string; color: string }; owner: { id: string; name: string } | null } })[] }>("/api/milestones"),

  getAllKpis: async () =>
    request<{ kpis: (InitiativeKPI & { initiative: { id: string; title: string; startDate: string | null; domain: { id: string; name: string; color: string }; owner: { id: string; name: string } | null } })[] }>("/api/kpis"),

  createMilestone: async (initiativeId: string, body: unknown) =>
    request<{ milestone: InitiativeMilestone }>(`/api/milestones/${initiativeId}`, {
      method: "POST", body: JSON.stringify(body),
    }),
  updateMilestone: async (id: string, body: unknown) =>
    request<{ milestone: InitiativeMilestone }>(`/api/milestones/${id}`, {
      method: "PUT", body: JSON.stringify(body),
    }),
  deleteMilestone: async (id: string) =>
    request<void>(`/api/milestones/${id}`, { method: "DELETE" }),

  createKpi: async (initiativeId: string, body: unknown) =>
    request<{ kpi: InitiativeKPI }>(`/api/kpis/${initiativeId}`, {
      method: "POST", body: JSON.stringify(body),
    }),
  updateKpi: async (id: string, body: unknown) =>
    request<{ kpi: InitiativeKPI }>(`/api/kpis/${id}`, {
      method: "PUT", body: JSON.stringify(body),
    }),
  deleteKpi: async (id: string) =>
    request<void>(`/api/kpis/${id}`, { method: "DELETE" }),

  createStakeholder: async (initiativeId: string, body: unknown) =>
    request<{ stakeholder: Stakeholder }>(`/api/stakeholders/${initiativeId}`, {
      method: "POST", body: JSON.stringify(body),
    }),
  updateStakeholder: async (id: string, body: unknown) =>
    request<{ stakeholder: Stakeholder }>(`/api/stakeholders/${id}`, {
      method: "PUT", body: JSON.stringify(body),
    }),
  deleteStakeholder: async (id: string) =>
    request<void>(`/api/stakeholders/${id}`, { method: "DELETE" }),

  getDomains: async () => request<{ domains: Domain[] }>("/api/domains"),
  createDomain: async (body: unknown) =>
    request<{ domain: Domain }>("/api/domains", { method: "POST", body: JSON.stringify(body) }),
  updateDomain: async (id: string, body: unknown) =>
    request<{ domain: Domain }>(`/api/domains/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteDomain: async (id: string) => request<void>(`/api/domains/${id}`, { method: "DELETE" }),

  getPersonas: async () => request<{ personas: Persona[] }>("/api/personas"),
  createPersona: async (body: unknown) =>
    request<{ persona: Persona }>("/api/personas", { method: "POST", body: JSON.stringify(body) }),
  updatePersona: async (id: string, body: unknown) =>
    request<{ persona: Persona }>(`/api/personas/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deletePersona: async (id: string) => request<void>(`/api/personas/${id}`, { method: "DELETE" }),

  getRevenueStreams: async () => request<{ revenueStreams: RevenueStream[] }>("/api/revenue-streams"),
  createRevenueStream: async (body: unknown) =>
    request<{ revenueStream: RevenueStream }>("/api/revenue-streams", { method: "POST", body: JSON.stringify(body) }),
  updateRevenueStream: async (id: string, body: unknown) =>
    request<{ revenueStream: RevenueStream }>(`/api/revenue-streams/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteRevenueStream: async (id: string) => request<void>(`/api/revenue-streams/${id}`, { method: "DELETE" }),

  exportData: async (entities?: string[]) => {
    const params = entities && entities.length > 0 ? `?entities=${entities.join(",")}` : "";
    const response = await fetch(`${baseUrl}/api/admin/export${params}`, { credentials: "include" });
    if (!response.ok) throw new Error(`Export failed: ${response.status}`);
    return response.json();
  },
  importData: async (payload: unknown, mode: "replace" | "merge" = "replace") =>
    request<{ ok: boolean; mode: string; counts: Record<string, number> }>("/api/admin/import", {
      method: "POST",
      body: JSON.stringify({ ...(payload as Record<string, unknown>), mode }),
    }),
  clearData: async () =>
    request<{ ok: boolean; message: string }>("/api/admin/clear", { method: "POST" }),
};
