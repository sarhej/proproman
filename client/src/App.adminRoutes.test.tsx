import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { MetaPayload, User } from "./types/models";
import App from "./App";

const adminUser: User = {
  id: "u-admin",
  email: "admin@example.com",
  name: "Admin",
  role: "ADMIN",
  isActive: true,
  activeTenantId: "t-1",
};

const mockUseAuth = vi.fn(() => ({
  user: adminUser,
  activeTenant: {
    id: "t-1",
    name: "Team",
    slug: "team",
    status: "ACTIVE" as const,
    isSystem: false,
  },
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));

vi.mock("./hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const emptyMeta: MetaPayload = {
  domains: [],
  personas: [],
  revenueStreams: [],
  users: [],
  products: [],
  accounts: [],
  partners: [],
  labelSuggestions: [],
};

const boardStub = {
  meta: emptyMeta,
  initiatives: [] as never[],
  filters: {},
  setFilters: vi.fn(),
  setInitiatives: vi.fn(),
  refresh: vi.fn(),
  refreshSilent: vi.fn(),
  loading: false,
  error: null as string | null,
};

vi.mock("./hooks/useBoardData", () => ({
  useBoardData: () => boardStub,
}));

vi.mock("./hooks/usePermissions", () => ({
  usePermissions: () => ({
    isSuperAdmin: false,
    isAdmin: true,
    canEditStructure: true,
    canEditContent: true,
    canEditMarketing: false,
    canManageUsers: true,
    canExport: true,
    canCreate: false,
  }),
}));

vi.mock("./hooks/useUiSettings", () => ({
  useUiSettings: () => ({
    hiddenNavPaths: new Set<string>(),
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("./hooks/useWorkspaceHubEvents", () => ({
  useWorkspaceHubEvents: () => {},
}));

vi.mock("./pages/AdminPage", () => ({
  AdminPage: ({ mode }: { mode: "users" | "settings" }) => (
    <div data-testid="admin-page" data-mode={mode} />
  ),
}));

describe("App admin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects /admin to users mode", async () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId("admin-page")).toHaveAttribute("data-mode", "users");
    });
  });

  it("renders settings mode at /admin/settings", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/settings"]}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId("admin-page")).toHaveAttribute("data-mode", "settings");
    });
  });
});
