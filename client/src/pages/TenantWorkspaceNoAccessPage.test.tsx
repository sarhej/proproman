import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TenantWorkspaceNoAccessPage } from "./TenantWorkspaceNoAccessPage";

const mockGetMyWorkspaceAccessRequest = vi.fn();
const mockSubmitWorkspaceAccessRequest = vi.fn();

vi.mock("../lib/api", () => ({
  api: {
    getMyWorkspaceAccessRequest: (...args: unknown[]) => mockGetMyWorkspaceAccessRequest(...args),
    submitWorkspaceAccessRequest: (...args: unknown[]) => mockSubmitWorkspaceAccessRequest(...args),
  },
}));

describe("TenantWorkspaceNoAccessPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMyWorkspaceAccessRequest.mockResolvedValue({ pending: false });
  });

  it("shows workspace name and continue action", async () => {
    const onContinue = vi.fn();
    render(
      <MemoryRouter>
        <TenantWorkspaceNoAccessPage
          workspaceName="Nakam API"
          workspaceSlug="nakamapi"
          userEmail="you@example.com"
          isPlatformPending={false}
          onContinue={onContinue}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockGetMyWorkspaceAccessRequest).toHaveBeenCalledWith("nakamapi");
    });

    expect(screen.getByTestId("tenant-workspace-no-access")).toBeInTheDocument();
    expect(screen.getByText("Nakam API")).toBeInTheDocument();
    expect(screen.getByText(/\/t\/nakamapi/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue to the app/i })).toBeInTheDocument();
    expect(screen.getByTestId("workspace-access-request")).toBeEnabled();
  });

  it("disables request when access already pending", async () => {
    mockGetMyWorkspaceAccessRequest.mockResolvedValue({ pending: true });
    render(
      <MemoryRouter>
        <TenantWorkspaceNoAccessPage
          workspaceName="Nakam API"
          workspaceSlug="nakamapi"
          userEmail="you@example.com"
          isPlatformPending={false}
          onContinue={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("workspace-access-request")).toBeDisabled();
    });
    expect(screen.getByText(/access request is waiting/i)).toBeInTheDocument();
  });

  it("submits access request and shows notified copy", async () => {
    mockSubmitWorkspaceAccessRequest.mockResolvedValue({
      pending: true,
      alreadyRequested: false,
      adminsNotified: true,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TenantWorkspaceNoAccessPage
          workspaceName="Nakam API"
          workspaceSlug="nakamapi"
          userEmail="you@example.com"
          isPlatformPending={false}
          onContinue={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("workspace-access-request")).toBeEnabled();
    });

    await user.click(screen.getByTestId("workspace-access-request"));

    await waitFor(() => {
      expect(mockSubmitWorkspaceAccessRequest).toHaveBeenCalledWith("nakamapi");
    });
    expect(await screen.findByText(/Workspace admins were emailed/i)).toBeInTheDocument();
    expect(screen.getByTestId("workspace-access-request")).toBeDisabled();
  });

  it("shows API error in alert", async () => {
    mockSubmitWorkspaceAccessRequest.mockRejectedValue(
      Object.assign(new Error("fail"), { status: 500, body: { error: "Server said no" } })
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TenantWorkspaceNoAccessPage
          workspaceName="Nakam API"
          workspaceSlug="nakamapi"
          userEmail="you@example.com"
          isPlatformPending={false}
          onContinue={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("workspace-access-request")).toBeEnabled();
    });
    await user.click(screen.getByTestId("workspace-access-request"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Server said no");
  });
});
