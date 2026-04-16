/**
 * Workspace "request access" on the no-membership gate (/t/:slug).
 * Mocks all /api/** traffic; Vite from playwright.config webServer.
 */
import { test, expect } from "@playwright/test";

const editorUser = {
  id: "u-wa-e2e",
  email: "wa-e2e@example.com",
  name: "WA E2E",
  role: "EDITOR",
  isActive: true,
  activeTenantId: "t-tymio",
};

const tymioTenant = {
  id: "t-tymio",
  name: "Tymio",
  slug: "tymio",
  status: "ACTIVE",
  isSystem: true,
};

const membershipTymio = {
  id: "m-wa-1",
  tenantId: "t-tymio",
  userId: "u-wa-e2e",
  role: "MEMBER",
  tenant: tymioTenant,
};

type AccessMockState = {
  getPending: boolean;
  postResponse: { pending: boolean; alreadyRequested: boolean; adminsNotified: boolean };
  postStatus: number;
};

function setupWorkspaceAccessApiMocks(
  page: import("@playwright/test").Page,
  state: AccessMockState,
  user: typeof editorUser = editorUser
) {
  return page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/auth/me") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user, activeTenant: tymioTenant }),
      });
      return;
    }

    if (url.includes("/api/me/tenants") && method === "GET" && !url.includes("switch")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tenants: [{ ...membershipTymio, userId: user.id }],
          activeTenantId: "t-tymio",
        }),
      });
      return;
    }

    if (url.match(/\/api\/tenants\/by-slug\/nakamapi\/public/i)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ name: "Nakam API", slug: "nakamapi" }),
      });
      return;
    }

    if (url.includes("/api/me/workspace-access-request")) {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pending: state.getPending }),
        });
        return;
      }
      if (method === "POST") {
        if (state.postStatus >= 400) {
          await route.fulfill({
            status: state.postStatus,
            contentType: "application/json",
            body: JSON.stringify({ error: "E2E forced failure" }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(state.postResponse),
          });
        }
        return;
      }
    }

    if (url.includes("/api/ui-settings") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          hiddenNavPaths: [],
          globalHiddenNavPaths: [],
          tenantHiddenNavPaths: [],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "E2E workspace-access unmocked: " + url }),
    });
  });
}

test.describe("Workspace access request (no-membership gate)", () => {
  test("loads Request access when no pending row", async ({ page }) => {
    const state: AccessMockState = {
      getPending: false,
      postResponse: { pending: true, alreadyRequested: false, adminsNotified: true },
      postStatus: 200,
    };
    await setupWorkspaceAccessApiMocks(page, state);
    await page.goto("/t/nakamapi");

    const gate = page.getByTestId("tenant-workspace-no-access");
    await expect(gate).toBeVisible({ timeout: 20_000 });
    await expect(gate.getByTestId("workspace-access-request")).toBeVisible();
    await expect(gate.getByTestId("workspace-access-request")).toBeEnabled();
  });

  test("disables Request access when GET reports pending", async ({ page }) => {
    const state: AccessMockState = {
      getPending: true,
      postResponse: { pending: true, alreadyRequested: true, adminsNotified: false },
      postStatus: 200,
    };
    await setupWorkspaceAccessApiMocks(page, state);
    await page.goto("/t/nakamapi");

    const gate = page.getByTestId("tenant-workspace-no-access");
    await expect(gate).toBeVisible({ timeout: 20_000 });
    await expect(gate.getByTestId("workspace-access-request")).toBeDisabled();
    await expect(gate.getByText(/access request is waiting/i)).toBeVisible();
  });

  test("POST success shows confirmation and disables button", async ({ page }) => {
    const state: AccessMockState = {
      getPending: false,
      postResponse: { pending: true, alreadyRequested: false, adminsNotified: true },
      postStatus: 200,
    };
    await setupWorkspaceAccessApiMocks(page, state);
    await page.goto("/t/nakamapi");

    const gate = page.getByTestId("tenant-workspace-no-access");
    await expect(gate.getByTestId("workspace-access-request")).toBeEnabled({ timeout: 20_000 });
    await gate.getByTestId("workspace-access-request").click();

    await expect(gate.getByText(/Workspace admins were emailed/i)).toBeVisible({ timeout: 10_000 });
    await expect(gate.getByTestId("workspace-access-request")).toBeDisabled();
  });

  test("POST already-requested shows neutral message", async ({ page }) => {
    const state: AccessMockState = {
      getPending: false,
      postResponse: { pending: true, alreadyRequested: true, adminsNotified: false },
      postStatus: 200,
    };
    await setupWorkspaceAccessApiMocks(page, state);
    await page.goto("/t/nakamapi");

    const gate = page.getByTestId("tenant-workspace-no-access");
    await expect(gate.getByTestId("workspace-access-request")).toBeEnabled({ timeout: 20_000 });
    await gate.getByTestId("workspace-access-request").click();

    await expect(gate.getByText(/already have a pending access request/i)).toBeVisible({ timeout: 10_000 });
  });

  test("POST error surfaces alert", async ({ page }) => {
    const state: AccessMockState = {
      getPending: false,
      postResponse: { pending: false, alreadyRequested: false, adminsNotified: false },
      postStatus: 500,
    };
    await setupWorkspaceAccessApiMocks(page, state);
    await page.goto("/t/nakamapi");

    const gate = page.getByTestId("tenant-workspace-no-access");
    await expect(gate.getByTestId("workspace-access-request")).toBeEnabled({ timeout: 20_000 });
    await gate.getByTestId("workspace-access-request").click();

    await expect(gate.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });
    await expect(gate.locator('[role="alert"]')).toContainText(/E2E forced failure|500/i);
  });

  test("platform PENDING user can still use Request access", async ({ page }) => {
    const pendingUser = { ...editorUser, id: "u-wa-pend", role: "PENDING" };
    const state: AccessMockState = {
      getPending: false,
      postResponse: { pending: true, alreadyRequested: false, adminsNotified: false },
      postStatus: 200,
    };
    await setupWorkspaceAccessApiMocks(page, state, pendingUser);
    await page.goto("/t/nakamapi");

    const gate = page.getByTestId("tenant-workspace-no-access");
    await expect(gate.getByTestId("workspace-access-request")).toBeEnabled({ timeout: 20_000 });
  });

  test("Continue to the app still works", async ({ page }) => {
    const state: AccessMockState = {
      getPending: false,
      postResponse: { pending: true, alreadyRequested: false, adminsNotified: false },
      postStatus: 200,
    };
    await setupWorkspaceAccessApiMocks(page, state);
    await page.goto("/t/nakamapi");

    const gate = page.getByTestId("tenant-workspace-no-access");
    await expect(gate).toBeVisible({ timeout: 20_000 });
    await gate.getByRole("button", { name: /Continue to the app/i }).click();
    await expect(page).toHaveURL(/\/?(\?|$)/);
  });
});
