import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    /** Avoid shared module mocks (e.g. `../db.js`) leaking between test files in the same thread. */
    pool: "forks",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
