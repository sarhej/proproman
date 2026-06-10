import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  AppShell,
  NAV_SIDEBAR_COLLAPSED_KEY,
  readSidebarCollapsed
} from "./AppShell";
import { api } from "../../lib/api";
import type { User } from "../../types/models";

vi.mock("../../lib/api", () => ({
  api: {
    getMessages: vi.fn().mockResolvedValue({ messages: [], unreadCount: 0 })
  }
}));

const viewer: User = {
  id: "u1",
  email: "v@example.com",
  name: "Viewer",
  role: "VIEWER",
  isActive: true,
  activeTenantId: "t1"
};

const permissions = {
  isSuperAdmin: false,
  isAdmin: false,
  canEditStructure: false,
  canEditContent: false,
  canEditMarketing: false,
  canManageUsers: false,
  canExport: true,
  canCreate: false
};

function renderShell(collapsedPref?: string) {
  if (collapsedPref !== undefined) {
    localStorage.setItem(NAV_SIDEBAR_COLLAPSED_KEY, collapsedPref);
  } else {
    localStorage.removeItem(NAV_SIDEBAR_COLLAPSED_KEY);
  }
  return render(
    <MemoryRouter>
      <AppShell
        user={viewer}
        permissions={permissions}
        hiddenNavPaths={new Set()}
        onLogout={vi.fn()}
        onExport={vi.fn()}
        onExportPdf={vi.fn()}
      >
        <div data-testid="main-child">content</div>
      </AppShell>
    </MemoryRouter>
  );
}

describe("AppShell sidebar collapse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(NAV_SIDEBAR_COLLAPSED_KEY);
  });

  it("defaults sidebar expanded on first visit", () => {
    expect(readSidebarCollapsed()).toBe(false);
    renderShell();
    const toggle = screen.getByRole("button", { name: /collapse sidebar/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("restores collapsed state from localStorage", () => {
    renderShell("true");
    const toggle = screen.getByRole("button", { name: /expand sidebar/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("persists collapse toggle to localStorage", () => {
    renderShell();
    const toggle = screen.getByRole("button", { name: /collapse sidebar/i });
    fireEvent.click(toggle);
    expect(localStorage.getItem(NAV_SIDEBAR_COLLAPSED_KEY)).toBe("true");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(api.getMessages).toHaveBeenCalled();
  });

  it("applies fluid layout class when layoutMode is fluid", () => {
    const { container } = render(
      <MemoryRouter>
        <AppShell
          user={viewer}
          permissions={permissions}
          hiddenNavPaths={new Set()}
          onLogout={vi.fn()}
          layoutMode="fluid"
        >
          <div>fluid</div>
        </AppShell>
      </MemoryRouter>
    );
    const layout = container.querySelector("[data-print-layout]");
    expect(layout?.className).toContain("max-w-none");
    expect(layout?.className).not.toContain("max-w-[1600px]");
  });

  it("sets min-w-0 on main for horizontal scroll", () => {
    const { container } = renderShell();
    const main = container.querySelector("main[data-print-content]");
    expect(main?.className).toContain("min-w-0");
  });

  it("places mobile menu button on the left with open menu label", () => {
    renderShell();
    const openMenu = screen.getByRole("button", { name: /open navigation menu/i });
    expect(openMenu.className).toContain("lg:hidden");
  });
});
