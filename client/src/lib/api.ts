import type {
  Decision,
  Feature,
  Initiative,
  MetaPayload,
  Risk,
  User
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
    })
};
