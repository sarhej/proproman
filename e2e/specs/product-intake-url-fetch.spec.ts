/**
 * Product intake Phase 6: URL fetch (mocked API).
 */
import { test, expect } from "@playwright/test";

const user = {
  id: "u-intake-url-e2e",
  email: "intake-url-e2e@example.com",
  name: "Intake URL E2E",
  role: "EDITOR",
  isActive: true,
  activeTenantId: "t-tymio",
};

const tenant = {
  id: "t-tymio",
  name: "Tymio",
  slug: "tymio",
  status: "ACTIVE",
  isSystem: true,
};

const membership = {
  id: "m-intake-url-1",
  tenantId: "t-tymio",
  userId: user.id,
  role: "MEMBER",
  tenant,
};

const product = {
  id: "prod-1",
  name: "Demo App",
  slug: "demo-app",
  itemType: "PRODUCT",
  sortOrder: 0,
  initiatives: [],
  executionBoards: [],
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "intake-url-s1",
    tenantId: tenant.id,
    productId: product.id,
    mode: "BUG",
    status: "CAPTURING",
    rawText: "",
    clarification: null,
    creationPlan: null,
    drafts: null,
    analyzeError: null,
    confidence: null,
    createdById: user.id,
    committedAt: null,
    createdAt: "2026-09-29T12:00:00.000Z",
    updatedAt: "2026-09-29T12:00:00.000Z",
    sourceChannel: "ui_product",
    sourceMeta: { channel: "ui_product", urlFetches: [] },
    ...overrides,
  };
}

async function mockApi(page: import("@playwright/test").Page) {
  let current = session();
  let lastFetchStatus: "ok" | "needs_auth" = "ok";

  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/auth/me") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user, activeTenant: tenant }),
      });
      return;
    }
    if (url.includes("/api/me/tenants/switch") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, activeTenantId: tenant.id }),
      });
      return;
    }
    if (url.includes("/api/me/tenants") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tenants: [membership], activeTenantId: tenant.id }),
      });
      return;
    }
    if (url.includes("/api/tenants/by-slug/") && url.includes("/public") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ name: tenant.name, slug: tenant.slug }),
      });
      return;
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
    if (url.includes("/api/meta") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          users: [user],
          domains: [],
          partners: [],
          accounts: [],
          personas: [],
          kpis: [],
          milestones: [],
          revenueStreams: [],
        }),
      });
      return;
    }
    if ((url.endsWith("/api/products") || url.includes("/api/products?")) && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ products: [product] }),
      });
      return;
    }
    if (url.includes("/api/initiatives") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ initiatives: [] }),
      });
      return;
    }
    if (url.includes("/api/intake-sessions") && method === "POST" && !url.includes("/fetch-url")) {
      if (url.endsWith("/api/intake-sessions") || /\/api\/intake-sessions\/?$/.test(new URL(url).pathname)) {
        current = session({ mode: "BUG", status: "CAPTURING" });
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ session: current }),
        });
        return;
      }
    }
    if (url.includes("/api/intake-sessions/") && method === "POST" && url.includes("/fetch-url")) {
      const body = (route.request().postDataJSON() as { url?: string }) ?? {};
      const reqUrl = body.url ?? "";
      if (lastFetchStatus === "needs_auth" || /notion\.so/i.test(reqUrl)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            session: current,
            urlFetch: {
              url: reqUrl,
              status: "needs_auth",
              provider: "notion",
              httpStatus: null,
              fetchedAt: new Date().toISOString(),
              normalizedTextRef: null,
              error: "We could not open that link automatically. Paste the page text below — you can keep going.",
            },
          }),
        });
        return;
      }
      current = session({
        rawText: `Source: ${reqUrl}\n\nFetched body`,
        sourceChannel: "url_fetch",
        sourceMeta: {
          channel: "url_fetch",
          urlFetches: [{ url: reqUrl, status: "ok" }],
        },
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: current,
          urlFetch: {
            url: reqUrl,
            status: "ok",
            provider: "generic",
            httpStatus: 200,
            fetchedAt: new Date().toISOString(),
            normalizedTextRef: "att-1",
            error: null,
          },
          attachment: {
            id: "att-1",
            filename: "fetched-example.com-spec.txt",
            mimeType: "text/plain",
          },
        }),
      });
      return;
    }
    if (url.includes("/api/intake-sessions/") && method === "PATCH") {
      const body = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
      current = { ...current, ...body, updatedAt: new Date().toISOString() };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: current }),
      });
      return;
    }
    if (url.includes("/api/attachments") || url.includes("/api/attachment-links")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ attachmentLinks: [], links: [], attachments: [] }),
      });
      return;
    }
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: `E2E unmocked ${method} ${url}` }),
    });
  });

  return {
    setFetchMode(mode: "ok" | "needs_auth") {
      lastFetchStatus = mode;
    },
  };
}

test.describe("Product intake URL fetch (mocked API)", () => {
  test("fetches public URL and shows success", async ({ page }) => {
    test.setTimeout(60_000);
    await mockApi(page);
    await page.goto("/t/tymio/product-explorer");
    await page.getByRole("button", { name: /Create Bug/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/Starting intake session/i)).toBeHidden({ timeout: 15_000 });
    await expect(page.getByLabel(/Link \(optional\)/i)).toBeVisible();
    await page.getByLabel(/Link \(optional\)/i).fill("https://example.com/spec");
    await page.getByRole("button", { name: /Add from link/i }).click();
    await expect(page.getByText(/Added text from example.com/i)).toBeVisible({ timeout: 15_000 });
  });

  test("shows calm paste fallback when link cannot be opened", async ({ page }) => {
    test.setTimeout(60_000);
    await mockApi(page);
    await page.goto("/t/tymio/product-explorer");
    await page.getByRole("button", { name: /Create Bug/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/Starting intake session/i)).toBeHidden({ timeout: 15_000 });
    await page.getByLabel(/Link \(optional\)/i).fill("https://www.notion.so/acme/private");
    await page.getByRole("button", { name: /Add from link/i }).click();
    await expect(page.getByText(/paste the page text/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/connect credentials/i)).toHaveCount(0);
  });
});
