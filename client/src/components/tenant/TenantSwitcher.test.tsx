import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TenantSwitcher } from "./TenantSwitcher";
import type { Tenant, TenantMembership } from "../../types/models";
import { api } from "../../lib/api";
import { copyWorkspaceEntryLink } from "../../lib/workspaceUrl";

vi.mock("../../lib/api", () => ({
  api: {
    getMyTenants: vi.fn(),
    switchTenant: vi.fn(),
  },
}));

vi.mock("../../lib/workspaceUrl", () => ({
  copyWorkspaceEntryLink: vi.fn().mockResolvedValue(true),
}));

const mockGetMyTenants = vi.mocked(api.getMyTenants);
const mockSwitchTenant = vi.mocked(api.switchTenant);
const mockCopyWorkspaceEntryLink = vi.mocked(copyWorkspaceEntryLink);

describe("TenantSwitcher", () => {
  const tenant: Tenant = { id: "t1", name: "Acme Corp", slug: "acme", status: "ACTIVE" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCopyWorkspaceEntryLink.mockResolvedValue(true);
  });

  it("loads memberships and shows copy sign-in link for single workspace", async () => {
    const membership: TenantMembership = {
      id: "m1",
      tenantId: "t1",
      userId: "u1",
      role: "MEMBER",
      tenant,
    };
    mockGetMyTenants.mockResolvedValue({ tenants: [membership], activeTenantId: "t1" });

    const user = userEvent.setup();
    render(<TenantSwitcher activeTenant={tenant} onSwitch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Acme Corp/i }));

    await waitFor(() => {
      expect(mockGetMyTenants).toHaveBeenCalled();
    });

    const copyBtn = await screen.findByRole("button", { name: /Copy workspace sign-in link/i });
    await user.click(copyBtn);

    await waitFor(() => {
      expect(mockCopyWorkspaceEntryLink).toHaveBeenCalledWith("acme");
    });

    expect(await screen.findByText(/Copied/i)).toBeInTheDocument();
  });

  it("shows copy per workspace when multiple memberships", async () => {
    const t2: Tenant = { id: "t2", name: "Beta", slug: "beta", status: "ACTIVE" };
    mockGetMyTenants.mockResolvedValue({
      tenants: [
        { id: "m1", tenantId: "t1", userId: "u1", role: "MEMBER", tenant },
        { id: "m2", tenantId: "t2", userId: "u1", role: "ADMIN", tenant: t2 },
      ],
      activeTenantId: "t1",
    });

    const user = userEvent.setup();
    render(<TenantSwitcher activeTenant={tenant} onSwitch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Acme Corp/i }));

    await waitFor(() => {
      expect(screen.getByText("Beta")).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByRole("button", { name: /Copy workspace sign-in link/i });
    expect(copyButtons.length).toBe(2);

    await user.click(copyButtons[1]!);
    await waitFor(() => {
      expect(mockCopyWorkspaceEntryLink).toHaveBeenCalledWith("beta");
    });
  });

  it("calls switchTenant when selecting another workspace", async () => {
    const t2: Tenant = { id: "t2", name: "Beta", slug: "beta", status: "ACTIVE" };
    mockGetMyTenants.mockResolvedValue({
      tenants: [
        { id: "m1", tenantId: "t1", userId: "u1", role: "MEMBER", tenant },
        { id: "m2", tenantId: "t2", userId: "u1", role: "MEMBER", tenant: t2 },
      ],
      activeTenantId: "t1",
    });
    mockSwitchTenant.mockResolvedValue({ ok: true, activeTenantId: "t2" });
    const onSwitch = vi.fn();

    const user = userEvent.setup();
    render(<TenantSwitcher activeTenant={tenant} onSwitch={onSwitch} />);

    await user.click(screen.getByRole("button", { name: /Acme Corp/i }));
    await screen.findByText("Beta");
    await user.click(screen.getByText("Beta"));

    await waitFor(() => {
      expect(mockSwitchTenant).toHaveBeenCalledWith("t2");
      expect(onSwitch).toHaveBeenCalledWith(t2);
    });
  });
});
