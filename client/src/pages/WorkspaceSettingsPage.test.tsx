import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceSettingsPage } from "./WorkspaceSettingsPage";
import { api } from "../lib/api";
import type { Tenant, User } from "../types/models";

vi.mock("../lib/api", () => ({
  api: {
    patchActiveTenantLanguages: vi.fn(),
  },
}));

const mockPatch = vi.mocked(api.patchActiveTenantLanguages);

const editor: User = {
  id: "u1",
  email: "a@b.c",
  name: "Alice",
  role: "EDITOR",
  isActive: true,
};

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "t1",
    name: "Acme",
    slug: "acme",
    status: "ACTIVE",
    membershipRole: "OWNER",
    enabledLocales: ["en", "pl"],
    ...overrides,
  };
}

describe("WorkspaceSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPatch.mockResolvedValue({ enabledLocales: ["en"] });
  });

  it("shows need-workspace copy when there is no active tenant", () => {
    render(<WorkspaceSettingsPage user={editor} activeTenant={null} onSaved={vi.fn()} />);
    expect(screen.getByText(/select a workspace/i)).toBeInTheDocument();
  });

  it("shows no-access copy for workspace members who are not owner/admin", () => {
    render(
      <WorkspaceSettingsPage
        user={editor}
        activeTenant={tenant({ membershipRole: "MEMBER" })}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByText(/only workspace owners and admins/i)).toBeInTheDocument();
  });

  it("SUPER_ADMIN can edit even with VIEWER membership", () => {
    const sa: User = { ...editor, role: "SUPER_ADMIN" };
    render(
      <WorkspaceSettingsPage
        user={sa}
        activeTenant={tenant({ membershipRole: "VIEWER" })}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { name: /workspace settings/i })).toBeInTheDocument();
  });

  it("loads checkboxes from tenant.enabledLocales and saves via API", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    mockPatch.mockResolvedValue({ enabledLocales: ["en", "pl", "cs"] });

    render(<WorkspaceSettingsPage user={editor} activeTenant={tenant()} onSaved={onSaved} />);

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /Čeština/i })).not.toBeChecked();
    });
    expect(screen.getByRole("checkbox", { name: /English/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Polski/i })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: /Čeština/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledTimes(1);
    });
    const sent = mockPatch.mock.calls[0][0].enabledLocales.slice().sort();
    expect(sent).toEqual(["cs", "en", "pl"].sort());
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });

  it("shows error when API save fails", async () => {
    const user = userEvent.setup();
    mockPatch.mockRejectedValue(new Error("network"));

    render(<WorkspaceSettingsPage user={editor} activeTenant={tenant()} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not save/i)).toBeInTheDocument();
    });
  });
});
