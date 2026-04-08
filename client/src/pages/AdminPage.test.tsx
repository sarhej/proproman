import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminPage } from "./AdminPage";
import { api } from "../lib/api";
import type { User } from "../types/models";

vi.mock("../lib/api", () => ({
  api: {
    getUsers: vi.fn(),
    getDomains: vi.fn(),
    getPersonas: vi.fn(),
    getRevenueStreams: vi.fn(),
    getUiSettings: vi.fn(),
    updateUiSettings: vi.fn(),
    exportData: vi.fn(),
  },
}));

const mockGetUsers = vi.mocked(api.getUsers);
const mockGetDomains = vi.mocked(api.getDomains);

const adminUser: User = {
  id: "u-admin",
  email: "a@b.c",
  name: "Admin",
  role: "ADMIN",
  isActive: true,
};

describe("AdminPage modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsers.mockResolvedValue({ users: [] });
    mockGetDomains.mockResolvedValue({ domains: [] });
    vi.mocked(api.getPersonas).mockResolvedValue({ personas: [] });
    vi.mocked(api.getRevenueStreams).mockResolvedValue({ revenueStreams: [] });
    vi.mocked(api.getUiSettings).mockResolvedValue({
      hiddenNavPaths: [],
      globalHiddenNavPaths: [],
      tenantHiddenNavPaths: [],
    });
    vi.mocked(api.exportData).mockResolvedValue({ version: 1 });
  });

  it("mode users shows user admin UI (no settings/data tabs)", async () => {
    render(
      <AdminPage
        mode="users"
        currentUser={adminUser}
        onMetaChanged={vi.fn()}
        onUiSettingsChanged={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add user/i })).toBeInTheDocument();
    });
    expect(mockGetUsers).toHaveBeenCalled();
    expect(mockGetDomains).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^settings$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^data$/i })).not.toBeInTheDocument();
  });

  it("mode settings shows inner tabs; switching to Data shows export UI (not users list)", async () => {
    const user = userEvent.setup();
    render(
      <AdminPage
        mode="settings"
        currentUser={{ ...adminUser, role: "SUPER_ADMIN" }}
        onMetaChanged={vi.fn()}
        onUiSettingsChanged={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(mockGetDomains).toHaveBeenCalled();
    });
    expect(screen.getByRole("button", { name: /^settings$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^data$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^activity$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^users$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^data$/i }));
    expect(await screen.findByRole("heading", { name: /^export$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add user/i })).not.toBeInTheDocument();
  });
});
