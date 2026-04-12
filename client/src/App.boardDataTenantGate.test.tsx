import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { User } from "./types/models";
import App from "./App";

const { boardEnabledArgs } = vi.hoisted(() => ({
  boardEnabledArgs: [] as boolean[],
}));

const editorNoTenant: User = {
  id: "u-new",
  email: "new@example.com",
  name: "New",
  role: "EDITOR",
  isActive: true,
  activeTenantId: null,
};

const mockGetMyTenants = vi.fn();
const mockGetMyWorkspaceRegistrationRequests = vi.fn();
const mockSwitchTenant = vi.fn();
const mockRefreshAuth = vi.fn();

vi.mock("./lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/api")>();
  return {
    api: {
      ...actual.api,
      getMyTenants: (...args: unknown[]) => mockGetMyTenants(...args),
      getMyWorkspaceRegistrationRequests: (...args: unknown[]) =>
        mockGetMyWorkspaceRegistrationRequests(...args),
      switchTenant: (...args: unknown[]) => mockSwitchTenant(...args),
    },
  };
});

const mockUseAuth = vi.fn(() => ({
  user: editorNoTenant,
  activeTenant: null,
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
  useBoardData: (enabled = true) => {
    boardEnabledArgs.push(enabled);
    return boardStub;
  },
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

describe("App — board data disabled when no activeTenant (TenantPicker)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    boardEnabledArgs.length = 0;
    mockRefreshAuth.mockResolvedValue(undefined);
    mockSwitchTenant.mockResolvedValue({ ok: true, activeTenantId: "t-x" });
    mockGetMyTenants.mockResolvedValue({ tenants: [], activeTenantId: null });
    mockGetMyWorkspaceRegistrationRequests.mockResolvedValue({ requests: [] });
  });

  it("does not enable useBoardData when user has no workspace (avoids /api/meta 400)", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/no workspaces/i)).toBeInTheDocument();
    });

    expect(boardEnabledArgs.length).toBeGreaterThan(0);
    expect(boardEnabledArgs.every((e) => e === false)).toBe(true);
  });
});
