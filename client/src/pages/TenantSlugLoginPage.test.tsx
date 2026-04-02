import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TenantSlugLoginPage } from "./TenantSlugLoginPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    getTenantBySlug: vi.fn(),
    devLogin: vi.fn(),
  },
}));

const mockGetTenantBySlug = vi.mocked(api.getTenantBySlug);

function renderPage(workspaceSlug: string) {
  return render(
    <MemoryRouter>
      <TenantSlugLoginPage workspaceSlug={workspaceSlug} onAuthenticated={vi.fn()} />
    </MemoryRouter>
  );
}

describe("TenantSlugLoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves slug via API and shows workspace sign-in (Continue with Google)", async () => {
    mockGetTenantBySlug.mockResolvedValue({ name: "Nakam-API", slug: "nakamapi" });
    renderPage("nakamapi");

    expect(screen.getByTestId("tenant-slug-loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("tenant-slug-signin")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByText("Nakam-API")).toBeInTheDocument();
    expect(mockGetTenantBySlug).toHaveBeenCalledWith("nakamapi");
  });

  it("shows not found when public slug API returns error", async () => {
    mockGetTenantBySlug.mockRejectedValue(new Error("not found"));
    renderPage("does-not-exist");

    await waitFor(() => {
      expect(screen.getByTestId("tenant-slug-not-found")).toBeInTheDocument();
    });
    expect(mockGetTenantBySlug).toHaveBeenCalledWith("does-not-exist");
  });

  it("trims workspace slug before calling API", async () => {
    mockGetTenantBySlug.mockResolvedValue({ name: "Acme", slug: "acme" });
    renderPage("  acme  ");

    await waitFor(() => {
      expect(mockGetTenantBySlug).toHaveBeenCalledWith("acme");
    });
  });

  it("treats whitespace-only slug as not found without calling API", async () => {
    renderPage("   ");

    await waitFor(() => {
      expect(screen.getByTestId("tenant-slug-not-found")).toBeInTheDocument();
    });
    expect(mockGetTenantBySlug).not.toHaveBeenCalled();
  });
});
