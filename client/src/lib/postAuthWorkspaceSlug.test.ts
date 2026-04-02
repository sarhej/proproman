import { describe, it, expect, beforeEach } from "vitest";
import {
  POST_AUTH_WORKSPACE_SLUG_KEY,
  clearPostAuthWorkspaceSlug,
  clearPostAuthWorkspaceSlugIfSlugPath,
  hasPostAuthWorkspaceSlugPendingOnRoot,
  rememberPostAuthWorkspaceSlug,
} from "./postAuthWorkspaceSlug";

describe("postAuthWorkspaceSlug", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("hasPostAuthWorkspaceSlugPendingOnRoot is true on / when slug remembered", () => {
    rememberPostAuthWorkspaceSlug("nakamapi");
    expect(hasPostAuthWorkspaceSlugPendingOnRoot("/")).toBe(true);
    expect(sessionStorage.getItem(POST_AUTH_WORKSPACE_SLUG_KEY)).toBe("nakamapi");
  });

  it("hasPostAuthWorkspaceSlugPendingOnRoot is false off root or without key", () => {
    rememberPostAuthWorkspaceSlug("x");
    expect(hasPostAuthWorkspaceSlugPendingOnRoot("/initiatives")).toBe(false);
    clearPostAuthWorkspaceSlug();
    expect(hasPostAuthWorkspaceSlugPendingOnRoot("/")).toBe(false);
  });

  it("clearPostAuthWorkspaceSlugIfSlugPath removes when path matches stored slug", () => {
    rememberPostAuthWorkspaceSlug("nakamapi");
    clearPostAuthWorkspaceSlugIfSlugPath("/t/nakamapi");
    expect(sessionStorage.getItem(POST_AUTH_WORKSPACE_SLUG_KEY)).toBeNull();
  });

  it("clearPostAuthWorkspaceSlug clears unconditionally", () => {
    rememberPostAuthWorkspaceSlug("a");
    clearPostAuthWorkspaceSlug();
    expect(sessionStorage.getItem(POST_AUTH_WORKSPACE_SLUG_KEY)).toBeNull();
  });
});
