import { describe, expect, it } from "vitest";
import {
  isWorkspacePrefixedPath,
  parseWorkspacePath,
  stripWorkspacePrefix,
  withWorkspacePrefix,
} from "./workspacePath";

describe("parseWorkspacePath", () => {
  it("parses /t/slug as home", () => {
    expect(parseWorkspacePath("/t/acme")).toEqual({ slug: "acme", innerPath: "/" });
    expect(parseWorkspacePath("/t/acme/")).toEqual({ slug: "acme", innerPath: "/" });
  });

  it("parses deep paths", () => {
    expect(parseWorkspacePath("/t/acme/priority")).toEqual({ slug: "acme", innerPath: "/priority" });
    expect(parseWorkspacePath("/t/acme/features/x")).toEqual({
      slug: "acme",
      innerPath: "/features/x",
    });
  });

  it("decodes slug segment", () => {
    expect(parseWorkspacePath("/t/hello%20world")).toEqual({ slug: "hello world", innerPath: "/" });
  });

  it("returns null for non-prefixed paths", () => {
    expect(parseWorkspacePath("/")).toBeNull();
    expect(parseWorkspacePath("/priority")).toBeNull();
    expect(parseWorkspacePath("/wiki/a")).toBeNull();
  });

  it("returns null when slug segment is empty or only slashes", () => {
    expect(parseWorkspacePath("/t/")).toBeNull();
    expect(parseWorkspacePath("/t//extra")).toBeNull();
  });

  it("returns null on invalid percent-encoding in slug segment", () => {
    expect(parseWorkspacePath("/t/%ZZ")).toBeNull();
  });

  it("preserves multi-segment inner paths and hyphens in slug", () => {
    expect(parseWorkspacePath("/t/my-team/products/p1/execution-board")).toEqual({
      slug: "my-team",
      innerPath: "/products/p1/execution-board",
    });
  });

  it("trims whitespace in decoded slug", () => {
    expect(parseWorkspacePath("/t/%20trim%20")).toEqual({ slug: "trim", innerPath: "/" });
  });
});

describe("stripWorkspacePrefix", () => {
  it("strips /t/slug prefix", () => {
    expect(stripWorkspacePrefix("/t/tymio/features/1")).toBe("/features/1");
    expect(stripWorkspacePrefix("/t/tymio")).toBe("/");
  });

  it("leaves other paths unchanged", () => {
    expect(stripWorkspacePrefix("/features/1")).toBe("/features/1");
  });
});

describe("withWorkspacePrefix", () => {
  it("builds home URL", () => {
    expect(withWorkspacePrefix("tymio", "/")).toBe("/t/tymio");
  });

  it("builds nested URL", () => {
    expect(withWorkspacePrefix("tymio", "/priority")).toBe("/t/tymio/priority");
    expect(withWorkspacePrefix("tymio", "/features/abc")).toBe("/t/tymio/features/abc");
  });

  it("encodes slug", () => {
    expect(withWorkspacePrefix("a b", "/")).toBe("/t/a%20b");
  });

  it("returns logical path only when slug empty", () => {
    expect(withWorkspacePrefix("", "/priority")).toBe("/priority");
    expect(withWorkspacePrefix("   ", "/gantt")).toBe("/gantt");
  });

  it("normalizes logical path without leading slash", () => {
    expect(withWorkspacePrefix("acme", "priority")).toBe("/t/acme/priority");
  });

  it("encodes reserved characters in slug for URL safety", () => {
    expect(withWorkspacePrefix("a/b", "/")).toBe("/t/a%2Fb");
  });
});

describe("isWorkspacePrefixedPath", () => {
  it("detects prefixed hub paths", () => {
    expect(isWorkspacePrefixedPath("/t/x")).toBe(true);
    expect(isWorkspacePrefixedPath("/t/x/y")).toBe(true);
    expect(isWorkspacePrefixedPath("/x")).toBe(false);
  });

  it("is false for invalid /t/... patterns", () => {
    expect(isWorkspacePrefixedPath("/t/")).toBe(false);
    expect(isWorkspacePrefixedPath("/t/%ZZ")).toBe(false);
  });
});
