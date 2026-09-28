/**
 * Product intake Phase 5: Approve draft → Create in hub (mocked API).
 */
import { test, expect } from "@playwright/test";

const user = {
  id: "u-intake-commit-e2e",
  email: "intake-commit-e2e@example.com",
  name: "Intake Commit E2E",
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
  id: "m-intake-commit-1",
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

const initiative = {
  id: "init-1",
  title: "Product roadmap",
  productId: product.id,
  domainId: "dom-1",
  domain: { id: "dom-1", name: "Platform", color: "#d97706", sortOrder: 0 },
  priority: "P2",
  horizon: "NOW",
  status: "IN_PROGRESS",
  commercialType: "CARE_QUALITY",
  isGap: false,
  isEpic: true,
  sortOrder: 0,
  archivedAt: null,
  personaImpacts: [],
  revenueWeights: [],
  features: [],
  decisions: [],
  risks: [],
  demandLinks: [],
  assignments: [],
  milestones: [],
  kpis: [],
  stakeholders: [],
};

const plan = {
  planType: "SINGLE_BUG_FEATURE",
  rationale: "e2e",
  confidence: 0.8,
  needsClarification: false,
  items: [
    {
      key: "bug-1",
      hubEntityType: "Feature",
      title: "Login CTA clipped",
      storyType: "BUG",
      parentKey: null,
    },
  ],
};

let draftItem = {
  key: "bug-1",
  hubEntityType: "Feature",
  storyType: "BUG",
  approval: "pending",
  fieldProvenance: {},
  title: "Login CTA clipped",
  description: "Button clipped",
  stepsToReproduce: ["Open login"],
  expected: "Visible",
  actual: "Clipped",
  environment: "iOS",
  severity: "HIGH",
  priority: "P1",
  acceptanceCriteria: ["CTA visible"],
  affectedArea: "",
  parentKey: null,
  route: { initiativeId: null, featureId: null },
  requirements: [],
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "intake-commit-s1",
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
    createdAt: "2026-09-28T12:00:00.000Z",
    updatedAt: "2026-09-28T12:00:00.000Z",
    ...overrides,
  };
}

async function mockApi(page: import("@playwright/test").Page) {
  let current = session();
  let draftsPayload = { items: [{ ...draftItem }], source: "heuristic" as const };

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
        body: JSON.stringify({ initiatives: [initiative] }),
      });
      return;
    }
    if (barePath === "/api/intake-sessions" && method === "POST") {
      current = session({ mode: "BUG", status: "CAPTURING" });
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
            message: "plan ready",
          },
        }),
      });
      return;
    }
    if (url.includes("/api/intake-sessions/") && method === "POST" && /\/drafts\/?(\?|$)/.test(url)) {
      draftItem = { ...draftItem, approval: "pending" };
      draftsPayload = { items: [{ ...draftItem }], source: "heuristic" };
      current = session({
        status: "REVIEWING",
        creationPlan: plan,
        drafts: draftsPayload,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: current,
          drafts: draftsPayload,
          source: "heuristic",
          message: "Bug drafts ready",
        }),
      });
      return;
    }
    if (url.includes("/api/intake-sessions/") && method === "PATCH" && url.includes("/drafts/")) {
      const body = route.request().postDataJSON() as { draft?: Record<string, unknown> };
      const next = { ...draftItem, ...draftsPayload.items[0], ...(body.draft ?? {}) };
      draftItem = next as typeof draftItem;
      draftsPayload = { items: [next as typeof draftItem], source: "heuristic" };
      current = { ...current, status: "REVIEWING", drafts: draftsPayload };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: current, draft: next, drafts: draftsPayload }),
      });
      return;
    }
    if (url.includes("/api/intake-sessions/") && method === "POST" && url.includes("/commit")) {
      const created = {
        initiatives: [],
        features: [
          {
            draftKey: "bug-1",
            id: "feat-created-1",
            title: "Login CTA clipped",
            storyType: "BUG",
          },
        ],
        requirements: [
          {
            draftKey: "bug-1-ac-1",
            id: "req-1",
            title: "CTA visible",
            featureId: "feat-created-1",
          },
        ],
      };
      current = session({
        status: "COMMITTED",
        creationPlan: plan,
        drafts: draftsPayload,
        committedAt: "2026-09-28T20:00:00.000Z",
        sourceMeta: { commitResult: created },
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: current,
          created,
          message: "Created 1 Feature(s) in the hub.",
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
}

test.describe("Product intake Create in hub (mocked API)", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("Approve → Create in hub → success", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/t/tymio/product-explorer");
    await page.getByRole("button", { name: /Create Bug/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/Starting intake session/i)).toBeHidden({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await page.getByPlaceholder(/Paste text, drop a screenshot/i).fill(
      "Login CTA clipped on rotate after keyboard opens"
    );
    await page.getByRole("button", { name: /^Analyze$/i }).click();
    await expect(page.getByText(/SINGLE_BUG_FEATURE/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Generate drafts/i }).click();
    await expect(page.getByText("Needs review", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Create in hub/i })).toBeDisabled();
    await page.getByRole("button", { name: /Approve for create/i }).click();
    await expect(page.getByText("Ready to create", { exact: true })).toBeVisible();
    await page.getByLabel(/Where should these Features go/i).selectOption("init-1");
    await page.getByRole("button", { name: /Create in hub \(1 ready\)/i }).click();
    await expect(page.getByText("Created in hub", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Feature · Login CTA clipped · BUG")).toBeVisible();
  });
});
