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
  Tenant,
  TenantMembership,
  TenantRequest,
  User,
  UserEmail,
  UserMessage,
  UserRole,
  Account,
  NotificationRule,
  UserNotificationSubscription,
  Capability,
  CapabilityBinding,
  CapabilityStatus,
  ExecutionBoard,
  ExecutionColumn,
  RepositoryConnection,
  WorkArtifactLink,
  DesignArtifactLink,
  Attachment,
  AttachmentLink,
  AttachmentBackupJob,
  IntakeSession,
  CreationPlan,
  UseCase,
  SecurityTopic,
  ArchitectureTopic,
  Release
} from "../types/models";

import { applyWorkspacePrefixToApiPath } from "./workspaceApiRouting";
import { getWorkspaceTenantIdForApi } from "./workspaceTenantHeader";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resolvedPath = applyWorkspacePrefixToApiPath(path);
  const tenantId = getWorkspaceTenantIdForApi();
  const useWorkspacePlane = resolvedPath.startsWith("/t/");
  const response = await fetch(`${baseUrl}${resolvedPath}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(!useWorkspacePlane && tenantId ? { "X-Tenant-Id": tenantId } : {}),
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

/** Multipart upload — do not set Content-Type (browser sets boundary). */
async function multipartRequest<T>(path: string, form: FormData): Promise<T> {
  const resolvedPath = applyWorkspacePrefixToApiPath(path);
  const tenantId = getWorkspaceTenantIdForApi();
  const useWorkspacePlane = resolvedPath.startsWith("/t/");
  const headers: Record<string, string> = {};
  if (!useWorkspacePlane && tenantId) headers["X-Tenant-Id"] = tenantId;
  const response = await fetch(`${baseUrl}${resolvedPath}`, {
    method: "POST",
    credentials: "include",
    headers,
    body: form
  });
  if (!response.ok) {
    let body: { error?: string; code?: string } | undefined;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const err = new Error(body?.error ?? `Upload failed: ${response.status}`) as Error & {
      status?: number;
      body?: unknown;
    };
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return (await response.json()) as T;
}

/** Authenticated content URL for an attachment preview/download. */
export function attachmentContentUrl(attachmentId: string, admin = false): string {
  const path = applyWorkspacePrefixToApiPath(
    `/api/attachments/${attachmentId}/content${admin ? "?admin=1" : ""}`
  );
  return `${baseUrl}${path}`;
}

export function attachmentBackupManifestUrl(jobId: string): string {
  const path = applyWorkspacePrefixToApiPath(`/api/attachment-backups/${jobId}/manifest`);
  return `${baseUrl}${path}`;
}

export const api = {
  getMe: async () => request<{ user: User | null; activeTenant: Tenant | null }>("/api/auth/me"),
  devLogin: async (role?: UserRole, tenantId?: string, tenantSlug?: string) =>
    request<{ user: User }>("/api/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({
        ...(role ? { role } : {}),
        ...(tenantId ? { tenantId } : {}),
        ...(tenantSlug ? { tenantSlug } : {}),
      }),
    }),
  getDevTenants: async () =>
    request<{ tenants: Tenant[] }>("/api/auth/dev-tenants"),
  logout: async () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  requestMagicLink: async (email: string) =>
    request<{ ok: boolean }>("/api/auth/email/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
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
  createIntakeSession: async (body: { productId: string; mode: "BUG" | "FEATURE" }) =>
    request<{ session: IntakeSession }>("/api/intake-sessions", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  getIntakeSession: async (id: string) =>
    request<{ session: IntakeSession }>(`/api/intake-sessions/${id}`),
  updateIntakeSession: async (
    id: string,
    body: { rawText?: string; sourceChannel?: string | null; status?: "CAPTURING" | "ABANDONED" | "FAILED" }
  ) =>
    request<{ session: IntakeSession }>(`/api/intake-sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  analyzeIntakeSession: async (id: string) =>
    request<{
      session: IntakeSession;
      analyze: {
        stub: boolean;
        source?: string;
        needsClarification: boolean;
        creationPlan: CreationPlan | null;
        confidence: number | null;
        message: string;
      };
    }>(`/api/intake-sessions/${id}/analyze`, {
      method: "POST",
      body: JSON.stringify({})
    }),
  clarifyIntakeSession: async (id: string, answers: Record<string, string>) =>
    request<{
      session: IntakeSession;
      analyze: {
        stub: boolean;
        source?: string;
        needsClarification: boolean;
        creationPlan: CreationPlan | null;
        confidence: number | null;
        message: string;
      };
    }>(`/api/intake-sessions/${id}/clarify`, {
      method: "POST",
      body: JSON.stringify({ answers })
    }),
  updateIntakePlan: async (id: string, creationPlan: CreationPlan) =>
    request<{ session: IntakeSession }>(`/api/intake-sessions/${id}/plan`, {
      method: "PATCH",
      body: JSON.stringify({ creationPlan })
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
  reorderFeatures: async (rows: Array<{ id: string; sortOrder: number }>) =>
    request<{ ok: boolean }>("/api/features/reorder", {
      method: "POST",
      body: JSON.stringify(rows)
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
  patchRisk: async (id: string, body: unknown) =>
    request<{ risk: Risk }>(`/api/risks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body)
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
  getExecutionBoards: async (productId: string) =>
    request<{ boards: ExecutionBoard[] }>(`/api/products/${productId}/execution-boards`),
  createExecutionBoard: async (productId: string, body: unknown) =>
    request<{ board: ExecutionBoard }>(`/api/products/${productId}/execution-boards`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateExecutionBoard: async (boardId: string, body: unknown) =>
    request<{ board: ExecutionBoard }>(`/api/execution-boards/${boardId}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  deleteExecutionBoard: async (boardId: string) =>
    request<void>(`/api/execution-boards/${boardId}`, { method: "DELETE" }),
  createExecutionColumn: async (boardId: string, body: unknown) =>
    request<{ column: ExecutionColumn }>(`/api/execution-boards/${boardId}/columns`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateExecutionColumn: async (columnId: string, body: unknown) =>
    request<{ column: ExecutionColumn }>(`/api/execution-columns/${columnId}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  deleteExecutionColumn: async (columnId: string) =>
    request<void>(`/api/execution-columns/${columnId}`, { method: "DELETE" }),
  reorderExecutionColumns: async (boardId: string, rows: Array<{ id: string; sortOrder: number }>) =>
    request<{ ok: boolean }>(`/api/execution-boards/${boardId}/columns/reorder`, {
      method: "POST",
      body: JSON.stringify(rows)
    }),
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
  getRepositoryConnections: async () =>
    request<{ repositoryConnections: RepositoryConnection[] }>("/api/repository-connections"),
  upsertRepositoryConnection: async (body: unknown) =>
    request<{ repositoryConnection: RepositoryConnection }>("/api/repository-connections", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  deleteRepositoryConnection: async (id: string) =>
    request<void>(`/api/repository-connections/${id}`, { method: "DELETE" }),
  getWorkArtifactLinks: async (params?: { featureId?: string; requirementId?: string }) => {
    const q = new URLSearchParams();
    if (params?.featureId) q.set("featureId", params.featureId);
    if (params?.requirementId) q.set("requirementId", params.requirementId);
    const suffix = q.toString() ? `?${q}` : "";
    return request<{ workArtifactLinks: WorkArtifactLink[] }>(`/api/work-artifact-links${suffix}`);
  },
  createWorkArtifactLink: async (body: unknown) =>
    request<{ workArtifactLink: WorkArtifactLink }>("/api/work-artifact-links", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  deleteWorkArtifactLink: async (id: string) =>
    request<void>(`/api/work-artifact-links/${id}`, { method: "DELETE" }),
  getDesignArtifactLinks: async (params?: { featureId?: string; requirementId?: string }) => {
    const q = new URLSearchParams();
    if (params?.featureId) q.set("featureId", params.featureId);
    if (params?.requirementId) q.set("requirementId", params.requirementId);
    const suffix = q.toString() ? `?${q}` : "";
    return request<{ designArtifactLinks: DesignArtifactLink[] }>(`/api/design-artifact-links${suffix}`);
  },
  createDesignArtifactLink: async (body: unknown) =>
    request<{ designArtifactLink: DesignArtifactLink }>("/api/design-artifact-links", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  deleteDesignArtifactLink: async (id: string) =>
    request<void>(`/api/design-artifact-links/${id}`, { method: "DELETE" }),

  listAttachments: async (params?: {
    q?: string;
    status?: string;
    unused?: boolean;
    includeRetired?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (params?.q) q.set("q", params.q);
    if (params?.status) q.set("status", params.status);
    if (params?.unused) q.set("unused", "1");
    if (params?.includeRetired) q.set("includeRetired", "1");
    const suffix = q.toString() ? `?${q}` : "";
    return request<{ attachments: Attachment[] }>(`/api/attachments${suffix}`);
  },
  getAttachment: async (id: string) =>
    request<{
      attachment: Attachment;
      downloadUrl: string | null;
      contentPath?: string | null;
    }>(`/api/attachments/${id}`),
  uploadAttachment: async (
    file: File,
    meta?: {
      filename?: string;
      source?: string;
      kind?: string;
      parentAttachmentId?: string | null;
      featureId?: string | null;
      requirementId?: string | null;
      initiativeId?: string | null;
      demandId?: string | null;
      intakeSessionId?: string | null;
      role?: string;
    }
  ) => {
    const form = new FormData();
    form.append("file", file);
    if (meta) {
      for (const [k, v] of Object.entries(meta)) {
        if (v !== undefined && v !== null) form.append(k, String(v));
      }
    }
    return multipartRequest<{ attachment: Attachment; link: AttachmentLink | null }>(
      "/api/attachments",
      form
    );
  },
  retireAttachment: async (id: string, reason?: string) =>
    request<{ attachment: Attachment }>(`/api/attachments/${id}/retire`, {
      method: "POST",
      body: JSON.stringify({ reason })
    }),
  restoreAttachment: async (id: string) =>
    request<{ attachment: Attachment }>(`/api/attachments/${id}/restore`, {
      method: "POST",
      body: JSON.stringify({})
    }),
  hardDeleteAttachment: async (id: string) =>
    request<void>(`/api/attachments/${id}?confirm=1`, { method: "DELETE" }),
  voiceCapture: async (
    file: File,
    meta?: {
      filename?: string;
      transcript?: string;
      featureId?: string | null;
      requirementId?: string | null;
      initiativeId?: string | null;
      demandId?: string | null;
      intakeSessionId?: string | null;
      role?: string;
    }
  ) => {
    const form = new FormData();
    form.append("file", file);
    if (meta) {
      for (const [k, v] of Object.entries(meta)) {
        if (v !== undefined && v !== null) form.append(k, String(v));
      }
    }
    return multipartRequest<{
      transcript: string;
      language: string | null;
      audio: { attachment: Attachment; link: AttachmentLink | null };
      transcriptAttachment: { attachment: Attachment; link: AttachmentLink | null };
    }>("/api/voice/capture", form);
  },
  voiceTranscribe: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return multipartRequest<{ transcript: string; language: string | null }>(
      "/api/voice/transcribe",
      form
    );
  },
  getVoiceStatus: async () => request<{ enabled: boolean }>("/api/voice/status"),
  getAttachmentLinks: async (params?: {
    featureId?: string;
    requirementId?: string;
    initiativeId?: string;
    demandId?: string;
    intakeSessionId?: string;
    attachmentId?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.featureId) q.set("featureId", params.featureId);
    if (params?.requirementId) q.set("requirementId", params.requirementId);
    if (params?.initiativeId) q.set("initiativeId", params.initiativeId);
    if (params?.demandId) q.set("demandId", params.demandId);
    if (params?.intakeSessionId) q.set("intakeSessionId", params.intakeSessionId);
    if (params?.attachmentId) q.set("attachmentId", params.attachmentId);
    const suffix = q.toString() ? `?${q}` : "";
    return request<{ attachmentLinks: AttachmentLink[] }>(`/api/attachment-links${suffix}`);
  },
  createAttachmentLink: async (body: {
    attachmentId: string;
    featureId?: string | null;
    requirementId?: string | null;
    initiativeId?: string | null;
    demandId?: string | null;
    intakeSessionId?: string | null;
    role?: string;
  }) =>
    request<{ attachmentLink: AttachmentLink; alreadyLinked?: boolean }>("/api/attachment-links", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  deleteAttachmentLink: async (id: string) =>
    request<void>(`/api/attachment-links/${id}`, { method: "DELETE" }),
  listAttachmentBackups: async () =>
    request<{ jobs: AttachmentBackupJob[] }>("/api/attachment-backups"),
  createAttachmentBackup: async (body?: { includeRetired?: boolean }) =>
    request<{ job: AttachmentBackupJob; contentPath?: string }>("/api/attachment-backups", {
      method: "POST",
      body: JSON.stringify(body ?? {})
    }),
  getAttachmentBackup: async (id: string) =>
    request<{
      job: AttachmentBackupJob;
      manifestDownloadUrl: string | null;
      contentPath: string | null;
    }>(`/api/attachment-backups/${id}`),

  getUseCases: async () => request<{ useCases: UseCase[] }>("/api/use-cases"),
  createUseCase: async (body: unknown) =>
    request<{ useCase: UseCase }>("/api/use-cases", { method: "POST", body: JSON.stringify(body) }),
  getSecurityTopics: async () =>
    request<{ securityTopics: SecurityTopic[] }>("/api/security-topics"),
  createSecurityTopic: async (body: unknown) =>
    request<{ securityTopic: SecurityTopic }>("/api/security-topics", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  getArchitectureTopics: async () =>
    request<{ architectureTopics: ArchitectureTopic[] }>("/api/architecture-topics"),
  getArchitectureTopic: async (id: string) =>
    request<{ architectureTopic: ArchitectureTopic }>(`/api/architecture-topics/${id}`),
  createArchitectureTopic: async (body: unknown) =>
    request<{ architectureTopic: ArchitectureTopic }>("/api/architecture-topics", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateArchitectureTopic: async (id: string, body: unknown) =>
    request<{ architectureTopic: ArchitectureTopic }>(`/api/architecture-topics/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  deleteArchitectureTopic: async (id: string) =>
    request<void>(`/api/architecture-topics/${id}`, { method: "DELETE" }),
  getWorkspaceAtlas: async () =>
    request<{
      atlas: Record<string, unknown> | null;
      compiled: boolean;
      freshness: {
        materializedAt: string;
        sourceMaxUpdatedAt: string;
        workspaceSlug: string;
        isStale: boolean;
        ageMinutes: number;
      } | null;
      health: {
        status: "incomplete" | "rebuilding" | "error" | "stale" | "current";
        pendingRebuild: boolean;
        compiling: boolean;
        lastRebuildAt: string | null;
        lastErrorMessage: string | null;
      };
    }>("/api/workspace-atlas"),
  getWorkspaceAtlasObject: async (objectType: string, id: string) =>
    request<{ shard: Record<string, unknown> }>(
      `/api/workspace-atlas/objects/${encodeURIComponent(objectType)}/${encodeURIComponent(id)}`
    ),
  getGitObserveHealth: async () =>
    request<{
      connections: Array<{
        id: string;
        provider: string;
        owner: string;
        repo: string;
        displayName: string | null;
        webhookUrl: string;
        webhookSecretConfigured: boolean;
        oauthConfigured: boolean;
        lastWebhookReceivedAt: string | null;
        lastWebhookEventType: string | null;
        lastWebhookError: string | null;
        activityCount: number;
        releaseCount: number;
      }>;
    }>("/api/git-observe/health"),
  getGitObserveActivity: async (params?: { limit?: number; connectionId?: string }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.connectionId) q.set("connectionId", params.connectionId);
    const suffix = q.toString() ? `?${q}` : "";
    return request<{
      activities: Array<{
        id: string;
        kind: string;
        action: string | null;
        branch: string | null;
        title: string | null;
        authorLogin: string | null;
        externalUrl: string | null;
        commitSha: string | null;
        prNumber: number | null;
        occurredAt: string;
        repository: { owner: string; repo: string; displayName: string | null };
      }>;
    }>(`/api/git-observe/activity${suffix}`);
  },
  testGitObserveConnection: async (connectionId: string) =>
    request<{ ok: boolean; deliveryId: string; webhookUrl: string; message: string }>(
      `/api/git-observe/connections/${encodeURIComponent(connectionId)}/test-event`,
      { method: "POST" }
    ),
  getAtlasProposals: async (status?: string) =>
    request<{ proposals: Record<string, unknown>[] }>(
      `/api/atlas-proposals${status ? `?status=${encodeURIComponent(status)}` : ""}`
    ),
  acceptAtlasProposal: async (id: string, body: { proposedValue?: unknown; reviewReason?: string | null }) =>
    request<{ proposal: Record<string, unknown> }>(`/api/atlas-proposals/${id}/accept`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  rejectAtlasProposal: async (id: string, body: { reviewReason?: string | null }) =>
    request<{ proposal: Record<string, unknown> }>(`/api/atlas-proposals/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  runAtlasCurator: async (body?: { architectureTopicId?: string }) =>
    request<{
      result: {
        created: number;
        skipped: number;
        topicsProcessed: number;
        proposalIds: string[];
        errors: Array<{ architectureTopicId: string; message: string }>;
      };
    }>("/api/atlas-curator/run", {
      method: "POST",
      body: JSON.stringify(body ?? {})
    }),
  getReleases: async () => request<{ releases: Release[] }>("/api/releases"),
  createRelease: async (body: unknown) =>
    request<{ release: Release }>("/api/releases", { method: "POST", body: JSON.stringify(body) }),
  getRequirements: async (featureId?: string) =>
    request<{ requirements: Requirement[] }>(`/api/requirements${featureId ? `?featureId=${featureId}` : ""}`),
  createRequirement: async (body: unknown) =>
    request<{ requirement: Requirement }>("/api/requirements", { method: "POST", body: JSON.stringify(body) }),
  updateRequirement: async (id: string, body: unknown) =>
    request<{ requirement: Requirement }>(`/api/requirements/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  saveExecutionBoardLayout: async (body: {
    productId: string;
    columns: Array<{ executionColumnId: string | null; requirementIds: string[] }>;
  }) =>
    request<{ ok: boolean }>("/api/requirements/execution-layout", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  reorderRequirements: async (rows: Array<{ id: string; sortOrder: number }>) =>
    request<{ ok: boolean }>("/api/requirements/reorder", {
      method: "POST",
      body: JSON.stringify(rows)
    }),
  deleteRequirement: async (id: string) => request<void>(`/api/requirements/${id}`, { method: "DELETE" }),
  getAssignments: async (initiativeId?: string) =>
    request<{ assignments: InitiativeAssignment[] }>(`/api/assignments${initiativeId ? `?initiativeId=${initiativeId}` : ""}`),
  addAssignment: async (body: unknown) =>
    request<{ assignment: InitiativeAssignment }>("/api/assignments", { method: "POST", body: JSON.stringify(body) }),
  updateAssignment: async (body: unknown) =>
    request<{ assignment: InitiativeAssignment }>("/api/assignments", { method: "PUT", body: JSON.stringify(body) }),
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

  getOntologyCapabilities: async (status?: CapabilityStatus) => {
    const q = status ? `?status=${status}` : "";
    return request<{ capabilities: (Capability & { bindings: CapabilityBinding[] })[] }>(`/api/ontology/capabilities${q}`);
  },
  getOntologyCapability: async (id: string) =>
    request<{ capability: Capability & { bindings: CapabilityBinding[] } }>(`/api/ontology/capabilities/${id}`),
  createOntologyCapability: async (body: Record<string, unknown>) =>
    request<{ capability: Capability & { bindings: CapabilityBinding[] } }>("/api/ontology/capabilities", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateOntologyCapability: async (id: string, body: Record<string, unknown>) =>
    request<{ capability: Capability & { bindings: CapabilityBinding[] } }>(`/api/ontology/capabilities/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  deleteOntologyCapability: async (id: string) => request<void>(`/api/ontology/capabilities/${id}`, { method: "DELETE" }),
  createOntologyBinding: async (body: Record<string, unknown>) =>
    request<{ binding: CapabilityBinding }>("/api/ontology/bindings", { method: "POST", body: JSON.stringify(body) }),
  deleteOntologyBinding: async (id: string) => request<void>(`/api/ontology/bindings/${id}`, { method: "DELETE" }),
  compileOntologyBrief: async () => request<{ ok: boolean; message: string }>("/api/ontology/compile", { method: "POST", body: "{}" }),
  refreshOntologyBindings: async () =>
    request<{ ok: boolean; capabilitiesUpserted: number; bindingsUpserted: number }>("/api/ontology/refresh-bindings", {
      method: "POST",
      body: "{}"
    }),
  exportOntologyBriefFile: async (body?: { path?: string; mode?: "compact" | "full" }) =>
    request<{ ok: boolean; path: string; bytes: number }>("/api/ontology/export-file", {
      method: "POST",
      body: JSON.stringify(body ?? {})
    }),
  getOntologyBriefText: async (format: "md" | "json", mode: "compact" | "full") => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
    const params = new URLSearchParams({ format, mode });
    const response = await fetch(`${baseUrl}/api/ontology/brief?${params}`, { credentials: "include" });
    if (!response.ok) throw new Error(`Brief failed: ${response.status}`);
    return response.text();
  },
  getUiSettings: async () =>
    request<{
      hiddenNavPaths: string[];
      globalHiddenNavPaths?: string[];
      tenantHiddenNavPaths?: string[];
    }>("/api/ui-settings"),
  /** Platform (super admin): singleton ceiling merged with every workspace. */
  updateUiSettings: async (body: { hiddenNavPaths: string[] }) =>
    request<{ hiddenNavPaths: string[] }>("/api/ui-settings", { method: "PUT", body: JSON.stringify(body) }),
  /** Workspace OWNER/ADMIN: extra hidden paths (union with platform). */
  updateUiSettingsWorkspace: async (body: { hiddenNavPaths: string[] }) =>
    request<{
      hiddenNavPaths: string[];
      globalHiddenNavPaths: string[];
      tenantHiddenNavPaths: string[];
    }>("/api/ui-settings/workspace", { method: "PUT", body: JSON.stringify(body) }),

  getMyTenants: async () =>
    request<{ tenants: TenantMembership[]; activeTenantId: string | null }>("/api/me/tenants"),
  switchTenant: async (tenantId: string) =>
    request<{ ok: boolean; activeTenantId: string }>("/api/me/tenants/switch", {
      method: "POST",
      body: JSON.stringify({ tenantId }),
    }),
  patchActiveTenantLanguages: async (body: { enabledLocales: string[] }) =>
    request<{ enabledLocales: string[] }>("/api/me/active-tenant/languages", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // Tenant registration (public)
  submitTenantRequest: async (body: {
    teamName: string;
    slug: string;
    contactEmail: string;
    contactName: string;
    message?: string;
    inviteEmails?: string[];
    trustCompanyDomain?: boolean;
    /** UI language (en, cs, sk, pl, uk) for server-side email templates. */
    locale?: string;
  }) =>
    request<
      TenantRequest & {
        tenant?: Tenant | null;
        emailNotifications?: {
          adminsNotifiedOnSubmit?: boolean;
          decisionEmailsConfigured?: boolean;
          autoApproved?: boolean;
          autoApproveFailed?: boolean;
          requesterNotifiedOnDecision?: boolean;
          inviteesNotifiedCount?: number;
        };
      }
    >("/api/tenant-requests", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getTenantRequestStatus: async (id: string) =>
    request<{ id: string; teamName: string; status: string; createdAt: string; reviewNote: string | null }>(
      `/api/tenant-requests/status/${id}`
    ),

  // Tenant admin (SUPER_ADMIN)
  getTenantRequests: async (status?: string) =>
    request<{ requests: TenantRequest[] }>(
      `/api/tenant-requests${status ? `?status=${status}` : ""}`
    ),
  getTenantRequestDetail: async (id: string) =>
    request<TenantRequest>(`/api/tenant-requests/${id}`),
  reviewTenantRequest: async (id: string, body: { action: "approve" | "reject"; reviewNote?: string }) =>
    request<TenantRequest | { request: TenantRequest; tenant: Tenant }>(
      `/api/tenant-requests/${id}/review`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  // Tenant admin (SUPER_ADMIN) - existing wrappers
  getAdminTenants: async () =>
    request<Tenant[]>("/api/tenants"),
  getAdminTenant: async (id: string) =>
    request<Tenant & { memberships: Array<{ id: string; userId: string; role: string; user: { id: string; email: string; name: string; avatarUrl?: string | null } }>; domains: unknown[]; migrationState: unknown }>(
      `/api/tenants/${id}`
    ),
  updateAdminTenant: async (id: string, body: { name?: string; status?: string; slug?: string }) =>
    request<Tenant>(`/api/tenants/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  addTenantMember: async (tenantId: string, body: { userId: string; role?: string }) =>
    request<unknown>(`/api/tenants/${tenantId}/members`, { method: "POST", body: JSON.stringify(body) }),
  removeTenantMember: async (tenantId: string, userId: string) =>
    request<{ ok: boolean }>(`/api/tenants/${tenantId}/members/${userId}`, { method: "DELETE" }),

  // Public tenant slug resolution
  getTenantBySlug: async (slug: string) =>
    request<{ name: string; slug: string }>(`/api/tenants/by-slug/${encodeURIComponent(slug)}/public`),

  /** Public: correlates slug with registration row and tenant (for /t/:slug UX when workspace is not ACTIVE yet). */
  lookupTenantSlugContext: async (slug: string) =>
    request<{
      normalizedSlug: string;
      registrationRequest: {
        id: string;
        status: string;
        slug: string;
        tenantId: string | null;
        teamName: string;
        reviewNote: string | null;
      } | null;
      linkedTenant: { id: string; slug: string; status: string; name: string } | null;
      activeTenantBySlug: { id: string; slug: string; status: string; name: string } | null;
    }>(`/api/tenant-requests/lookup-by-slug/${encodeURIComponent(slug)}`),

  /** Logged-in (including platform PENDING): workspace registration rows where contact email matches the user. */
  getMyWorkspaceRegistrationRequests: async () =>
    request<{
      requests: Array<{
        id: string;
        teamName: string;
        slug: string;
        status: string;
        createdAt: string;
        reviewNote: string | null;
      }>;
    }>("/api/me/workspace-registration-requests"),

  /** Logged-in (including platform PENDING): pending join request for an ACTIVE workspace slug. */
  getMyWorkspaceAccessRequest: async (tenantSlug: string) =>
    request<{ pending: boolean }>(
      `/api/me/workspace-access-request?tenantSlug=${encodeURIComponent(tenantSlug)}`
    ),
  submitWorkspaceAccessRequest: async (tenantSlug: string) =>
    request<{
      pending: boolean;
      alreadyRequested: boolean;
      adminsNotified: boolean;
    }>("/api/me/workspace-access-request", {
      method: "POST",
      body: JSON.stringify({ tenantSlug }),
    }),
};
