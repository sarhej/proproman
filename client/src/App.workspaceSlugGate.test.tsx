import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { User } from "./types/models";
import App from "./App";

const mockGetMyTenants = vi.fn();
const mockGetTenantBySlug = vi.fn();
const mockGetMyWorkspaceRegistrationRequests = vi.fn();
const mockSwitchTenant = vi.fn();
const mockRefreshAuth = vi.fn();

vi.mock("./lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/api")>();
  return {
    api: {
      ...actual.api,
      getMyTenants: (...args: unknown[]) => mockGetMyTenants(...args),
      getTenantBySlug: (...args: unknown[]) => mockGetTenantBySlug(...args),
      getMyWorkspaceRegistrationRequests: (...args: unknown[]) =>
        mockGetMyWorkspaceRegistrationRequests(...args),
      switchTenant: (...args: unknown[]) => mockSwitchTenant(...args),
    },
  };
});

const editorUser: User = {
  id: "u1",
  email: "you@example.com",
  name: "You",
  role: "EDITOR",
  isActive: true,
  activeTenantId: "t-tymio",
};

const mockUseAuth = vi.fn(() => ({
  user: editorUser,
  activeTenant: {
    id: "t-tymio",
    name: "Tymio",
    slug: "tymio",
    status: "ACTIVE" as const,
    isSystem: true,
  },
  loading: false,
  error: null as string | null,
  refresh: mockRefreshAuth,
}));

vi.mock("./hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const boardStub = {
  meta: null as null,
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
    isAdmin: false,
    canEditStructure: false,
    canEditContent: true,
    canEditMarketing: false,
    canManageUsers: false,
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

describe("App /t/:slug gate (active workspace, no membership)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshAuth.mockResolvedValue(undefined);
    mockSwitchTenant.mockResolvedValue({ ok: true, activeTenantId: "t-naka" });
    mockGetMyTenants.mockResolvedValue({
      tenants: [
        {
          tenant: {
            id: "t-tymio",
            name: "Tymio",
            slug: "tymio",
            status: "ACTIVE",
            isSystem: true,
          },
          role: "MEMBER",
        },
      ],
      activeTenantId: "t-tymio",
    });
    mockGetTenantBySlug.mockResolvedValue({ name: "Nakam API", slug: "nakamapi" });
    mockGetMyWorkspaceRegistrationRequests.mockResolvedValue({ requests: [] });
  });

  it("shows TenantWorkspaceNoAccessPage when tenant is ACTIVE but user has no membership", async () => {
    render(
      <MemoryRouter initialEntries={["/t/nakamapi"]}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("tenant-workspace-no-access")).toBeInTheDocument();
    });

    expect(screen.getByText("Nakam API")).toBeInTheDocument();
    expect(mockGetTenantBySlug).toHaveBeenCalledWith("nakamapi");
    expect(mockSwitchTenant).not.toHaveBeenCalled();
  });

  it("switches tenant and leaves /t when user is already a member of that slug", async () => {
    mockGetMyTenants.mockResolvedValue({
      tenants: [
        {
          tenant: {
            id: "t-naka",
            name: "Nakam API",
            slug: "nakamapi",
            status: "ACTIVE",
            isSystem: false,
          },
          role: "MEMBER",
        },
      ],
      activeTenantId: "t-tymio",
    });

    render(
      <MemoryRouter initialEntries={["/t/nakamapi"]}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockSwitchTenant).toHaveBeenCalledWith("t-naka");
    });
    expect(mockRefreshAuth).toHaveBeenCalled();
    expect(screen.queryByTestId("tenant-workspace-no-access")).not.toBeInTheDocument();
  });
});
