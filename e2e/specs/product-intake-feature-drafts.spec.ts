/**
 * Product intake Phase 4: Create Feature → analyze → generate drafts → edit problem/priority.
 * Mocks /api/**; Vite from playwright.config webServer.
 */
import { test, expect } from "@playwright/test";

const user = {
  id: "u-intake-feat-e2e",
  email: "intake-feat-e2e@example.com",
  name: "Intake Feature E2E",
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
  id: "m-intake-feat-1",
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

const plan = {
  planType: "SINGLE_FEATURE",
  rationale: "e2e feature plan",
  confidence: 0.8,
  needsClarification: false,
  items: [
    {
      key: "feat-1",
      hubEntityType: "Feature",
      title: "Facet filters for search",
      storyType: "FUNCTIONAL",
      parentKey: null,
      suggestedPriority: "DISCOVERY",
    },
  ],
};

const draftItem = {
  key: "feat-1",
  hubEntityType: "Feature",
  storyType: "FUNCTIONAL",
  approval: "pending",
  fieldProvenance: { priority: "ai", title: "ai", problem: "ai" },
  title: "Facet filters for search",
  problem: "Users cannot narrow search results",
  solution: "Add facet filters on the results page",
  personas: ["Product manager"],
  businessValue: "Faster findability",
  priority: "DISCOVERY",
  priorityRationale: "Scope still ambiguous",
  missingInputs: ["Success metrics"],
  acceptanceCriteria: ["User can filter by status"],
  dependencies: [],
  risks: [],
  openQuestions: [],
  parentKey: null,
  route: { initiativeId: null, featureId: null },
  requirements: [],
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "intake-feat-s1",
    tenantId: tenant.id,
    productId: product.id,
    mode: "FEATURE",
    status: "CAPTURING",
    rawText: "",
    clarification: null,
    creationPlan: null,
    drafts: null,
    analyzeError: null,
    confidence: null,
    createdById: user.id,
    committedAt: null,
    createdAt: "2026-09-28T12:00:00.000Z",
    updatedAt: "2026-09-28T12:00:00.000Z",
    ...overrides,
  };
}

async function mockIntakeWorkspace(page: import("@playwright/test").Page) {
  let current = session();
  let draftsPayload = { items: [draftItem], source: "heuristic" as const };

  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const barePath = new URL(url).pathname.replace(/^\/t\/[^/]+/, "");

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

    if (barePath === "/api/intake-sessions" && method === "POST") {
      current = session({ mode: "FEATURE", status: "CAPTURING" });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ session: current }),
      });
      return;
    }

    if (url.includes("/api/intake-sessions/") && method === "POST" && url.includes("/analyze")) {
      current = session({
        status: "PLAN_READY",
        rawText: String(current.rawText || ""),
        creationPlan: plan,
        confidence: 0.8,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: current,
          analyze: {
            stub: false,
            source: "heuristic",
            needsClarification: false,
            creationPlan: plan,
            confidence: 0.8,
            message: "Creation plan ready (heuristic).",
          },
        }),
      });
      return;
    }

    if (url.includes("/api/intake-sessions/") && method === "POST" && /\/drafts\/?(\?|$)/.test(url)) {
      draftsPayload = { items: [{ ...draftItem }], source: "heuristic" };
      current = session({
        status: "REVIEWING",
        creationPlan: plan,
        drafts: draftsPayload,
        confidence: 0.8,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: current,
          drafts: draftsPayload,
          source: "heuristic",
          message: "Feature drafts ready (heuristic).",
        }),
      });
      return;
    }

    if (url.includes("/api/intake-sessions/") && method === "PATCH" && url.includes("/drafts/")) {
      const body = route.request().postDataJSON() as { draft?: Record<string, unknown> };
      const patch = body.draft ?? {};
      const next = { ...draftItem, ...draftsPayload.items[0], ...patch };
      if ("priority" in patch) {
        next.fieldProvenance = { ...next.fieldProvenance, priority: "user" };
      }
      draftsPayload = { items: [next], source: "heuristic" };
      current = { ...current, status: "REVIEWING", drafts: draftsPayload };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: current, draft: next, drafts: draftsPayload }),
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
}

test.describe("Product intake Create Feature drafts (mocked API)", () => {
  test.beforeEach(async ({ page }) => {
    await mockIntakeWorkspace(page);
  });

  test("Create Feature → Analyze → Generate drafts → edit problem and priority", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/t/tymio/product-explorer");

    await expect(page.getByRole("button", { name: /Create Feature/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: /Create Feature/i }).first().click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/Starting intake session/i)).toBeHidden({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/Paste text, drop a screenshot/i)).toBeEnabled({
      timeout: 10_000,
    });

    await page.waitForTimeout(500);
    await page.getByPlaceholder(/Paste text, drop a screenshot/i).fill(
      "We need facet filters so PMs can narrow search results by status and owner."
    );

    await page.getByRole("button", { name: /^Analyze$/i }).click();
    await expect(page.getByText(/SINGLE_FEATURE/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[value="Facet filters for search"]')).toBeVisible();

    await page.getByRole("button", { name: /Generate drafts/i }).click();
    await expect(page.getByText(/^Feature drafts$/i)).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("textarea").filter({ hasText: "Users cannot narrow search results" })
    ).toBeVisible();
    await expect(page.getByLabel("Priority", { exact: true })).toHaveValue("DISCOVERY");

    await page.getByLabel("Problem").fill("Updated: users struggle to find work");
    await page.getByLabel("Problem").blur();
    await expect(page.getByLabel("Problem")).toHaveValue("Updated: users struggle to find work");

    await page.getByLabel("Priority", { exact: true }).selectOption("P2");
    await expect(page.getByLabel("Priority", { exact: true })).toHaveValue("P2");
  });
});
