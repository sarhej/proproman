import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TenantWorkspaceNoAccessPage } from "./TenantWorkspaceNoAccessPage";

describe("TenantWorkspaceNoAccessPage", () => {
  it("shows workspace name and continue action", () => {
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

    expect(screen.getByTestId("tenant-workspace-no-access")).toBeInTheDocument();
    expect(screen.getByText("Nakam API")).toBeInTheDocument();
    expect(screen.getByText(/\/t\/nakamapi/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue to the app/i })).toBeInTheDocument();
  });
});
