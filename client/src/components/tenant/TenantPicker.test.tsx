import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TenantPicker } from "./TenantPicker";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: {
    getMyTenants: vi.fn(),
    getMyWorkspaceRegistrationRequests: vi.fn(),
    switchTenant: vi.fn(),
  },
}));

const mockGetMyTenants = vi.mocked(api.getMyTenants);
const mockGetRegs = vi.mocked(api.getMyWorkspaceRegistrationRequests);
const mockSwitchTenant = vi.mocked(api.switchTenant);

describe("TenantPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows registration section when user has no workspaces but has registration rows", async () => {
    mockGetMyTenants.mockResolvedValue({ tenants: [], activeTenantId: null });
    mockGetRegs.mockResolvedValue({
      requests: [
        {
          id: "tr1",
          teamName: "Acme Co",
          slug: "acme",
          status: "PENDING",
          createdAt: "2026-01-01T00:00:00.000Z",
          reviewNote: null,
        },
      ],
    });

    render(<TenantPicker onSelected={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /No workspaces available/i })).toBeInTheDocument();
    });

    expect(screen.getByTestId("tenant-picker-registration-section")).toBeInTheDocument();
    expect(screen.getByText(/Acme Co/i)).toBeInTheDocument();
    expect(screen.getByText(/\/t\/acme/i)).toBeInTheDocument();
    expect(mockSwitchTenant).not.toHaveBeenCalled();
  });

  it("omits registration section when getMyWorkspaceRegistrationRequests fails", async () => {
    mockGetMyTenants.mockResolvedValue({ tenants: [], activeTenantId: null });
    mockGetRegs.mockRejectedValue(new Error("forbidden"));

    render(<TenantPicker onSelected={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /No workspaces available/i })).toBeInTheDocument();
    });

    expect(screen.queryByTestId("tenant-picker-registration-section")).not.toBeInTheDocument();
  });

  it("renders APPROVED and REJECTED registration lines", async () => {
    mockGetMyTenants.mockResolvedValue({ tenants: [], activeTenantId: null });
    mockGetRegs.mockResolvedValue({
      requests: [
        {
          id: "a1",
          teamName: "Beta",
          slug: "beta",
          status: "APPROVED",
          createdAt: "2026-01-01T00:00:00.000Z",
          reviewNote: null,
        },
        {
          id: "r1",
          teamName: "Gamma",
          slug: "gamma",
          status: "REJECTED",
          createdAt: "2026-01-02T00:00:00.000Z",
          reviewNote: null,
        },
      ],
    });

    render(<TenantPicker onSelected={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("tenant-picker-registration-section")).toBeInTheDocument();
    });

    expect(screen.getByText(/Beta/i)).toBeInTheDocument();
    expect(screen.getByText(/\/t\/beta/i)).toBeInTheDocument();
    expect(screen.getByText(/Gamma/i)).toBeInTheDocument();
    expect(screen.getByText(/\/t\/gamma/i)).toBeInTheDocument();
  });
});
