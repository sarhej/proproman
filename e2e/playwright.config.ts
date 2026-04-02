import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browser E2E: workspace entry URL, unauthenticated auth/me, public slug API.
 * Mocks `/api/*` in tests so only the Vite dev server is required (no DB).
 */
const clientDir = path.join(process.cwd(), "client");

export default defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 5173 --strictPort",
    cwd: clientDir,
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
