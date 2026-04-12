import type { ReactElement } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TenantSwitcher } from "./TenantSwitcher";
import type { Tenant, TenantMembership } from "../../types/models";
import { api } from "../../lib/api";
import { copyWorkspaceEntryLink } from "../../lib/workspaceUrl";

vi.mock("../../lib/api", () => ({
  api: {
    getMyTenants: vi.fn(),
    getMyWorkspaceRegistrationRequests: vi.fn(),
    switchTenant: vi.fn(),
    submitTenantRequest: vi.fn(),
  },
}));

vi.mock("../../lib/workspaceUrl", () => ({
  copyWorkspaceEntryLink: vi.fn().mockResolvedValue(true),
}));

const mockGetMyTenants = vi.mocked(api.getMyTenants);
const mockGetRegs = vi.mocked(api.getMyWorkspaceRegistrationRequests);
const mockSwitchTenant = vi.mocked(api.switchTenant);
const mockSubmitTenantRequest = vi.mocked(api.submitTenantRequest);
const mockCopyWorkspaceEntryLink = vi.mocked(copyWorkspaceEntryLink);

const currentUser = { name: "Jane Doe", email: "jane@example.com" };

function renderWithRouter(ui: ReactElement, initialEntry = "/") {
  return render(<MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>);
}

/** JSDOM `location.replace` is not mockable via `vi.spyOn`; replace the whole object like workspaceUrl tests. */
function mockLocationReplace(replaceImpl: (url: string) => void) {
  const prev = window.location;
  const replace = vi.fn(replaceImpl);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...prev, replace },
    writable: true,
  });
  return { replace, restore: () => Object.defineProperty(window, "location", { configurable: true, value: prev, writable: true }) };
}

describe("TenantSwitcher", () => {
  const tenant: Tenant = { id: "t1", name: "Acme Corp", slug: "acme", status: "ACTIVE" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCopyWorkspaceEntryLink.mockResolvedValue(true);
    mockGetRegs.mockResolvedValue({ requests: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    renderWithRouter(<TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={vi.fn()} />);

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
    renderWithRouter(<TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Acme Corp/i }));

    await waitFor(() => {
      expect(screen.getByText("Beta")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Request new workspace/i })).toBeInTheDocument();

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
    const { replace, restore } = mockLocationReplace(() => {});

    const user = userEvent.setup();
    try {
      renderWithRouter(<TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={onSwitch} />);

      await user.click(screen.getByRole("button", { name: /Acme Corp/i }));
      await screen.findByText("Beta");
      await user.click(screen.getByText("Beta"));

      await waitFor(() => {
        expect(mockSwitchTenant).toHaveBeenCalledWith("t2");
        expect(onSwitch).toHaveBeenCalledWith(t2);
        expect(replace).toHaveBeenCalledWith("/t/beta");
      });
    } finally {
      restore();
    }
  });

  it("replaces the URL with the new workspace slug while preserving the logical hub path", async () => {
    const t2: Tenant = { id: "t2", name: "Beta", slug: "beta", status: "ACTIVE" };
    mockGetMyTenants.mockResolvedValue({
      tenants: [
        { id: "m1", tenantId: "t1", userId: "u1", role: "MEMBER", tenant },
        { id: "m2", tenantId: "t2", userId: "u1", role: "MEMBER", tenant: t2 },
      ],
      activeTenantId: "t1",
    });
    mockSwitchTenant.mockResolvedValue({ ok: true, activeTenantId: "t2" });
    const { replace, restore } = mockLocationReplace(() => {});

    const user = userEvent.setup();
    try {
      renderWithRouter(
        <TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={vi.fn()} />,
        "/t/acme/priority"
      );

      await user.click(screen.getByRole("button", { name: /Acme Corp/i }));
      await screen.findByText("Beta");
      await user.click(screen.getByText("Beta"));

      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith("/t/beta/priority");
      });
    } finally {
      restore();
    }
  });

  it("preserves search and hash when replacing URL after workspace switch", async () => {
    const t2: Tenant = { id: "t2", name: "Beta", slug: "beta", status: "ACTIVE" };
    mockGetMyTenants.mockResolvedValue({
      tenants: [
        { id: "m1", tenantId: "t1", userId: "u1", role: "MEMBER", tenant },
        { id: "m2", tenantId: "t2", userId: "u1", role: "MEMBER", tenant: t2 },
      ],
      activeTenantId: "t1",
    });
    mockSwitchTenant.mockResolvedValue({ ok: true, activeTenantId: "t2" });
    const { replace, restore } = mockLocationReplace(() => {});

    const user = userEvent.setup();
    try {
      renderWithRouter(
        <TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={vi.fn()} />,
        "/t/acme/priority?tab=a#section"
      );

      await user.click(screen.getByRole("button", { name: /Acme Corp/i }));
      await screen.findByText("Beta");
      await user.click(screen.getByText("Beta"));

      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith("/t/beta/priority?tab=a#section");
      });
    } finally {
      restore();
    }
  });

  it("does not replace location when switchTenant fails", async () => {
    const t2: Tenant = { id: "t2", name: "Beta", slug: "beta", status: "ACTIVE" };
    mockGetMyTenants.mockResolvedValue({
      tenants: [
        { id: "m1", tenantId: "t1", userId: "u1", role: "MEMBER", tenant },
        { id: "m2", tenantId: "t2", userId: "u1", role: "MEMBER", tenant: t2 },
      ],
      activeTenantId: "t1",
    });
    mockSwitchTenant.mockRejectedValue(new Error("network"));
    const { replace, restore } = mockLocationReplace(() => {});

    const user = userEvent.setup();
    try {
      renderWithRouter(
        <TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={vi.fn()} />,
        "/t/acme/priority"
      );

      await user.click(screen.getByRole("button", { name: /Acme Corp/i }));
      await screen.findByText("Beta");
      await user.click(screen.getByText("Beta"));

      await waitFor(() => {
        expect(mockSwitchTenant).toHaveBeenCalled();
      });
      expect(replace).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("lists workspace applications under a separate heading", async () => {
    mockGetMyTenants.mockResolvedValue({
      tenants: [{ id: "m1", tenantId: "t1", userId: "u1", role: "OWNER", tenant }],
      activeTenantId: "t1",
    });
    mockGetRegs.mockResolvedValue({
      requests: [
        {
          id: "r1",
          teamName: "Gamma Team",
          slug: "gamma",
          status: "PENDING",
          createdAt: "",
          reviewNote: null,
        },
      ],
    });

    const user = userEvent.setup();
    renderWithRouter(<TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Acme Corp/i }));

    await waitFor(() => {
      expect(screen.getByText("Applications")).toBeInTheDocument();
    });
    expect(screen.getByText("Gamma Team")).toBeInTheDocument();
    expect(screen.getByText("Pending approval")).toBeInTheDocument();
    expect(mockGetRegs).toHaveBeenCalled();
  });

  it("hides applications section when registration slug matches an existing membership", async () => {
    mockGetMyTenants.mockResolvedValue({
      tenants: [{ id: "m1", tenantId: "t1", userId: "u1", role: "OWNER", tenant }],
      activeTenantId: "t1",
    });
    mockGetRegs.mockResolvedValue({
      requests: [
        {
          id: "r1",
          teamName: "Acme Corp",
          slug: "acme",
          status: "PENDING",
          createdAt: "",
          reviewNote: null,
        },
      ],
    });

    const user = userEvent.setup();
    renderWithRouter(<TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Acme Corp/i }));

    await waitFor(() => {
      expect(mockGetRegs).toHaveBeenCalled();
    });

    expect(screen.queryByText("Applications")).not.toBeInTheDocument();
  });

  it("shows Request new workspace in dropdown and opens modal", async () => {
    const t2: Tenant = { id: "t2", name: "Beta", slug: "beta", status: "ACTIVE" };
    mockGetMyTenants.mockResolvedValue({
      tenants: [
        { id: "m1", tenantId: "t1", userId: "u1", role: "MEMBER", tenant },
        { id: "m2", tenantId: "t2", userId: "u1", role: "MEMBER", tenant: t2 },
      ],
      activeTenantId: "t1",
    });

    const user = userEvent.setup();
    renderWithRouter(<TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Acme Corp/i }));
    await screen.findByText("Beta");

    await user.click(screen.getByRole("button", { name: /Request new workspace/i }));

    expect(await screen.findByRole("heading", { name: /Request new workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Workspace name/i })).toBeInTheDocument();
  });

  it("shows Request button on compact single-workspace row after load", async () => {
    mockGetMyTenants.mockResolvedValue({
      tenants: [{ id: "m1", tenantId: "t1", userId: "u1", role: "MEMBER", tenant }],
      activeTenantId: "t1",
    });

    const user = userEvent.setup();
    renderWithRouter(<TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Acme Corp/i }));
    await waitFor(() => {
      expect(mockGetMyTenants).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Acme Corp/i })).not.toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Request new workspace/i })).toBeInTheDocument();
  });

  it("closes modal via Cancel without submitting", async () => {
    const t2: Tenant = { id: "t2", name: "Beta", slug: "beta", status: "ACTIVE" };
    mockGetMyTenants.mockResolvedValue({
      tenants: [
        { id: "m1", tenantId: "t1", userId: "u1", role: "MEMBER", tenant },
        { id: "m2", tenantId: "t2", userId: "u1", role: "MEMBER", tenant: t2 },
      ],
      activeTenantId: "t1",
    });

    const user = userEvent.setup();
    renderWithRouter(<TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Acme Corp/i }));
    await screen.findByText("Beta");
    await user.click(screen.getByRole("button", { name: /Request new workspace/i }));

    await screen.findByRole("heading", { name: /Request new workspace/i });
    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /Request new workspace/i })).not.toBeInTheDocument();
    });
    expect(mockSubmitTenantRequest).not.toHaveBeenCalled();
  });

  it("shows validation error when team name is too short after trim", async () => {
    const t2: Tenant = { id: "t2", name: "Beta", slug: "beta", status: "ACTIVE" };
    mockGetMyTenants.mockResolvedValue({
      tenants: [
        { id: "m1", tenantId: "t1", userId: "u1", role: "MEMBER", tenant },
        { id: "m2", tenantId: "t2", userId: "u1", role: "MEMBER", tenant: t2 },
      ],
      activeTenantId: "t1",
    });

    const user = userEvent.setup();
    renderWithRouter(<TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Acme Corp/i }));
    await screen.findByText("Beta");
    await user.click(screen.getByRole("button", { name: /Request new workspace/i }));

    const teamInput = await screen.findByRole("textbox", { name: /Workspace name/i });
    await user.clear(teamInput);
    await user.type(teamInput, "x");
    const slugInput = screen.getByRole("textbox", { name: /Workspace URL slug/i });
    await user.clear(slugInput);
    await user.type(slugInput, "xy");

    await user.click(screen.getByRole("button", { name: /^Submit request$/i }));

    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument();
    expect(mockSubmitTenantRequest).not.toHaveBeenCalled();
  });

  it("submits request and refetches registration requests", async () => {
    const t2: Tenant = { id: "t2", name: "Beta", slug: "beta", status: "ACTIVE" };
    mockGetMyTenants.mockResolvedValue({
      tenants: [
        { id: "m1", tenantId: "t1", userId: "u1", role: "MEMBER", tenant },
        { id: "m2", tenantId: "t2", userId: "u1", role: "MEMBER", tenant: t2 },
      ],
      activeTenantId: "t1",
    });
    mockSubmitTenantRequest.mockResolvedValue({
      id: "req1",
      teamName: "Delta",
      slug: "delta",
      contactEmail: currentUser.email,
      contactName: currentUser.name,
      status: "PENDING",
      createdAt: "",
      message: null,
      reviewNote: null,
      tenantId: null,
      emailNotifications: { adminsNotifiedOnSubmit: false, decisionEmailsConfigured: true },
    } as Awaited<ReturnType<typeof api.submitTenantRequest>>);

    const user = userEvent.setup();
    renderWithRouter(<TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Acme Corp/i }));
    await screen.findByText("Beta");
    await user.click(screen.getByRole("button", { name: /Request new workspace/i }));

    const teamInput = await screen.findByRole("textbox", { name: /Workspace name/i });
    await user.clear(teamInput);
    await user.type(teamInput, "Delta Team");
    const slugInput = screen.getByRole("textbox", { name: /Workspace URL slug/i });
    await user.clear(slugInput);
    await user.type(slugInput, "delta");

    const initialRegCalls = mockGetRegs.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /^Submit request$/i }));

    await waitFor(() => {
      expect(mockSubmitTenantRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          teamName: "Delta Team",
          slug: "delta",
          contactName: currentUser.name,
          contactEmail: currentUser.email,
          message: undefined,
        })
      );
    });

    expect(await screen.findByText(/Registration request submitted/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(mockGetRegs.mock.calls.length).toBeGreaterThan(initialRegCalls);
    });
  });

  it("shows slug-taken error on 409", async () => {
    const t2: Tenant = { id: "t2", name: "Beta", slug: "beta", status: "ACTIVE" };
    mockGetMyTenants.mockResolvedValue({
      tenants: [
        { id: "m1", tenantId: "t1", userId: "u1", role: "MEMBER", tenant },
        { id: "m2", tenantId: "t2", userId: "u1", role: "MEMBER", tenant: t2 },
      ],
      activeTenantId: "t1",
    });
    const err = new Error("conflict") as Error & { status?: number; body?: { error?: string } };
    err.status = 409;
    mockSubmitTenantRequest.mockRejectedValue(err);

    const user = userEvent.setup();
    renderWithRouter(<TenantSwitcher activeTenant={tenant} currentUser={currentUser} onSwitch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Acme Corp/i }));
    await screen.findByText("Beta");
    await user.click(screen.getByRole("button", { name: /Request new workspace/i }));

    const teamInput = await screen.findByRole("textbox", { name: /Workspace name/i });
    await user.type(teamInput, "Taken Co");
    const slugInput = screen.getByRole("textbox", { name: /Workspace URL slug/i });
    await user.clear(slugInput);
    await user.type(slugInput, "taken-slug");

    await user.click(screen.getByRole("button", { name: /^Submit request$/i }));

    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();
  });
});
