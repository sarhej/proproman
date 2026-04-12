import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { RegisterTeamPage } from "./RegisterTeamPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    submitTenantRequest: vi.fn(),
  },
}));

const mockSubmit = vi.mocked(api.submitTenantRequest);

function renderPage(props: {
  prefilledContact?: { email: string; name: string };
  onWorkspaceProvisioned?: (slug: string) => void | Promise<void>;
}) {
  return render(
    <MemoryRouter>
      <RegisterTeamPage onBack={vi.fn()} {...props} />
    </MemoryRouter>
  );
}

describe("RegisterTeamPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onWorkspaceProvisioned and skips success screen when API returns APPROVED with tenant", async () => {
    const user = userEvent.setup();
    const onProvisioned = vi.fn().mockResolvedValue(undefined);
    mockSubmit.mockResolvedValue({
      id: "tr-1",
      teamName: "Team A",
      slug: "team-a",
      contactEmail: "u@company.com",
      contactName: "User",
      status: "APPROVED",
      tenantId: "t1",
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      message: null,
      preferredLocale: null,
      inviteEmails: null,
      trustCompanyDomain: false,
      trustedEmailDomain: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tenant: { id: "t1", name: "Team A", slug: "team-a", status: "ACTIVE" },
      emailNotifications: { autoApproved: true, decisionEmailsConfigured: false },
    });

    renderPage({
      prefilledContact: { email: "u@company.com", name: "User" },
      onWorkspaceProvisioned: onProvisioned,
    });

    await user.type(screen.getByPlaceholderText("Acme Corp"), "My Team");
    await user.click(screen.getByRole("button", { name: /Submit registration request/i }));

    await waitFor(() => {
      expect(onProvisioned).toHaveBeenCalledWith("team-a");
    });
    expect(screen.queryByRole("heading", { name: /Registration request submitted/i })).not.toBeInTheDocument();
  });

  it("shows auto-approved success when API returns APPROVED but no onWorkspaceProvisioned (signed-out flow)", async () => {
    const user = userEvent.setup();
    mockSubmit.mockResolvedValue({
      id: "tr-auto",
      teamName: "Team A",
      slug: "team-a",
      contactEmail: "u@company.com",
      contactName: "User",
      status: "APPROVED",
      tenantId: "t1",
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      message: null,
      preferredLocale: null,
      inviteEmails: null,
      trustCompanyDomain: false,
      trustedEmailDomain: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tenant: { id: "t1", name: "Team A", slug: "team-a", status: "ACTIVE" },
      emailNotifications: { autoApproved: true, decisionEmailsConfigured: false },
    });

    renderPage({
      prefilledContact: { email: "u@company.com", name: "User" },
    });

    await user.type(screen.getByPlaceholderText("Acme Corp"), "My Team");
    await user.click(screen.getByRole("button", { name: /Submit registration request/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Your workspace is ready/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /Registration request submitted/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open \/t\/team-a/i })).toHaveAttribute("href", expect.stringContaining("/t/team-a"));
  });

  it("shows success state when request stays PENDING (no callback navigation)", async () => {
    const user = userEvent.setup();
    mockSubmit.mockResolvedValue({
      id: "tr-2",
      teamName: "Team B",
      slug: "team-b",
      contactEmail: "u@company.com",
      contactName: "User",
      status: "PENDING",
      tenantId: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      message: null,
      preferredLocale: null,
      inviteEmails: null,
      trustCompanyDomain: false,
      trustedEmailDomain: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      emailNotifications: { adminsNotifiedOnSubmit: false, decisionEmailsConfigured: false },
    });

    renderPage({
      prefilledContact: { email: "u@company.com", name: "User" },
      onWorkspaceProvisioned: vi.fn(),
    });

    await user.type(screen.getByPlaceholderText("Acme Corp"), "Other Team");
    await user.click(screen.getByRole("button", { name: /Submit registration request/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Registration request submitted/i })).toBeInTheDocument();
    });
    expect(mockSubmit).toHaveBeenCalled();
  });
});
