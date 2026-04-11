import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ViewRoute } from "./ViewRoute";
import type { User } from "../types/models";

const editor: User = {
  id: "u1",
  email: "e@example.com",
  name: "Ed",
  role: "EDITOR",
  isActive: true,
  activeTenantId: "t1",
};

describe("ViewRoute", () => {
  it("renders children when route is not hidden", () => {
    const router = createMemoryRouter(
      [
        {
          path: "/t/:workspaceSlug",
          children: [
            {
              path: "priority",
              element: (
                <ViewRoute user={editor} path="/priority" hiddenNavPaths={new Set()}>
                  <div data-testid="inner">ok</div>
                </ViewRoute>
              ),
            },
          ],
        },
      ],
      { initialEntries: ["/t/acme/priority"] }
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("inner")).toBeInTheDocument();
  });

  it("redirects to first available path with workspace prefix when hidden", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/t/:workspaceSlug",
          children: [
            {
              path: "priority",
              element: (
                <ViewRoute user={editor} path="/priority" hiddenNavPaths={new Set(["/priority"])}>
                  <div data-testid="inner">hidden</div>
                </ViewRoute>
              ),
            },
            {
              index: true,
              element: <div data-testid="home">home</div>,
            },
          ],
        },
      ],
      { initialEntries: ["/t/acme/priority"] }
    );
    render(<RouterProvider router={router} />);
    await waitFor(() => {
      expect(screen.queryByTestId("inner")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/t/acme");
    });
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });

  it("does not prefix redirect when workspaceSlug is missing (legacy layout)", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/priority",
          element: (
            <ViewRoute user={editor} path="/priority" hiddenNavPaths={new Set(["/priority"])}>
              <div data-testid="inner">x</div>
            </ViewRoute>
          ),
        },
        {
          path: "/",
          element: <div data-testid="root">root</div>,
        },
      ],
      { initialEntries: ["/priority"] }
    );
    render(<RouterProvider router={router} />);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(screen.getByTestId("root")).toBeInTheDocument();
  });

  it("shows message when all managed paths are hidden", () => {
    const allHidden = new Set<string>([
      "/",
      "/priority",
      "/raci",
      "/status-kanban",
      "/accountability",
      "/kpi-dashboard",
      "/heatmap",
      "/buyer-user",
      "/gaps",
      "/product-explorer",
      "/workspace-settings",
      "/accounts",
      "/demands",
      "/partners",
      "/campaigns",
      "/milestones",
      "/calendar",
      "/gantt",
    ]);
    const router = createMemoryRouter(
      [
        {
          path: "/t/:workspaceSlug/priority",
          element: (
            <ViewRoute user={editor} path="/priority" hiddenNavPaths={allHidden}>
              <div data-testid="inner">x</div>
            </ViewRoute>
          ),
        },
      ],
      { initialEntries: ["/t/acme/priority"] }
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByText(/No navigation views are available/i)).toBeInTheDocument();
  });
});
