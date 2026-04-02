/**
 * Workspace URL + auth bootstrap (browser).
 *
 * Not covered here (environmental / non-app):
 * - "SES Removing unpermitted intrinsics" — browser extensions / lockdown scripts.
 * - Cloudflare Insights blocked by CSP — fix in server Helmet `script-src` / `connect-src` if you need that beacon.
 */
import { test, expect } from "@playwright/test";

/** Unauthenticated session: /api/auth/me returns 401 (same as production when logged out). */
async function mockUnauthenticatedApi(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized" }),
    });
  });
}

test.describe("Workspace entry URL /t/:slug (unauthenticated)", () => {
  test.beforeEach(async ({ page }) => {
    await mockUnauthenticatedApi(page);
  });

  test("does not stay stuck on loading: shows workspace sign-in after slug resolves", async ({ page }) => {
    await page.route("**/api/tenants/by-slug/nakamapi/public", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ name: "Nakam-API", slug: "nakamapi" }),
      });
    });

    await page.goto("/t/nakamapi");

    const signin = page.getByTestId("tenant-slug-signin");
    await expect(signin).toBeVisible({ timeout: 15_000 });
    await expect(signin.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(signin.getByText("Nakam-API", { exact: true })).toBeVisible();
  });

  test("shows workspace not found when public slug returns 404", async ({ page }) => {
    await page.route("**/api/tenants/by-slug/unknown-workspace/public", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Workspace not found." }),
      });
    });

    await page.goto("/t/unknown-workspace");

    await expect(page.getByTestId("tenant-slug-not-found")).toBeVisible({ timeout: 15_000 });
  });

  test("home route shows landing (not infinite loading) after 401 on /me", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/Loading authentication/i)).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Sign in to your workspace/i })).toBeVisible();
  });
});

test.describe("Network: /me failure modes", () => {
  test("500 on /me surfaces error state but leaves app interactive", async ({ page }) => {
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal" }),
      });
    });
    await page.route("**/api/tenants/by-slug/errslug/public", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ name: "Err", slug: "errslug" }),
      });
    });

    await page.goto("/t/errslug");

    await expect(page.getByTestId("tenant-slug-signin")).toBeVisible({ timeout: 15_000 });
  });
});
