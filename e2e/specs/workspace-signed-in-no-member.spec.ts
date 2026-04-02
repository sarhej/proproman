/**
 * Signed-in user opens /t/:slug for an ACTIVE workspace they are not a member of.
 * Mocks /api/* only; Vite dev server (webServer in playwright.config).
 */
import { test, expect } from "@playwright/test";

const editorUser = {
  id: "u-e2e",
  email: "e2e@example.com",
  name: "E2E User",
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
  id: "m1",
  tenantId: "t-tymio",
  userId: "u-e2e",
  role: "MEMBER",
  tenant: tymioTenant,
};

async function mockAuthenticatedNoAccessToNakamapi(page: import("@playwright/test").Page) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/auth/me") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: editorUser, activeTenant: tymioTenant }),
      });
      return;
    }

    if (url.includes("/api/me/tenants") && method === "GET" && !url.includes("switch")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tenants: [membershipTymio],
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

    if (url.includes("/api/ui-settings") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ hiddenNavPaths: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "E2E: unmocked " + url }),
    });
  });
}

test.describe("Workspace entry /t/:slug (signed in, not a member)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedNoAccessToNakamapi(page);
  });

  test("shows no-access screen for ACTIVE slug when user has no membership", async ({ page }) => {
    await page.goto("/t/nakamapi");

    const gate = page.getByTestId("tenant-workspace-no-access");
    await expect(gate).toBeVisible({ timeout: 20_000 });
    await expect(gate.getByText(/Nakam API/i)).toBeVisible();
    await expect(gate.getByText(/\/t\/nakamapi/i)).toBeVisible();
    await expect(gate.getByRole("button", { name: /Continue to the app/i })).toBeVisible();
  });
});
