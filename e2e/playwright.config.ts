import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browser E2E: workspace entry URL, unauthenticated auth/me, public slug API.
 * Mocks `/api/*` in tests (route interception), so no real DB is required.
 *
 * Local (default): starts Vite on 127.0.0.1:5173.
 * Deployed: set PLAYWRIGHT_BASE_URL=https://tymio.app (no trailing slash) — skips webServer.
 */
const clientDir = path.join(process.cwd(), "client");
const deployedBase = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "").trim();
const useDeployed = !!deployedBase;

export default defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"]],
  use: {
    baseURL: deployedBase ?? "http://127.0.0.1:5173",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  ...(useDeployed
    ? {}
    : {
        webServer: {
          command: "npx vite --host 127.0.0.1 --port 5173 --strictPort",
          cwd: clientDir,
          url: "http://127.0.0.1:5173",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
