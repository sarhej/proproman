/**
 * Shim: when cwd is `mcp/`, `npx vitest run --config mcp/vitest.config.ts` resolves here.
 * Re-exports the real config so `root` stays the `mcp/` package directory.
 */
export { default } from "../vitest.config.js";
