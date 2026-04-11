import type { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useWorkspaceHref, useWorkspaceLinkBuilder } from "./useWorkspaceHref";

function hubRouteWrapper(initialPath: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/t/:workspaceSlug/*" element={<>{children}</>} />
        </Routes>
      </MemoryRouter>
    );
  };
}

describe("useWorkspaceHref", () => {
  it("prefixes path when inside /t/:workspaceSlug/*", () => {
    const { result } = renderHook(() => useWorkspaceHref("/priority"), {
      wrapper: hubRouteWrapper("/t/acme/priority"),
    });
    expect(result.current).toBe("/t/acme/priority");
  });

  it("prefixes home as /t/slug only", () => {
    const { result } = renderHook(() => useWorkspaceHref("/"), {
      wrapper: hubRouteWrapper("/t/acme"),
    });
    expect(result.current).toBe("/t/acme");
  });

  it("appends query string after prefixed path", () => {
    const { result } = renderHook(() => useWorkspaceHref("/campaigns?highlight=c1"), {
      wrapper: hubRouteWrapper("/t/acme/campaigns"),
    });
    expect(result.current).toBe("/t/acme/campaigns?highlight=c1");
  });

  it("returns logical path when workspaceSlug param is absent", () => {
    const { result } = renderHook(() => useWorkspaceHref("/features/x"), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={["/features/x"]}>
          <Routes>
            <Route path="/features/:id" element={<>{children}</>} />
          </Routes>
        </MemoryRouter>
      ),
    });
    expect(result.current).toBe("/features/x");
  });

  it("adds leading slash to logical path when slug missing and path has no slash", () => {
    const { result } = renderHook(() => useWorkspaceHref("orphan"), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={["/orphan"]}>
          <Routes>
            <Route path="/orphan" element={<>{children}</>} />
          </Routes>
        </MemoryRouter>
      ),
    });
    expect(result.current).toBe("/orphan");
  });
});

describe("useWorkspaceLinkBuilder", () => {
  it("builds stable prefixed URLs for dynamic segments", () => {
    const { result } = renderHook(() => useWorkspaceLinkBuilder(), {
      wrapper: hubRouteWrapper("/t/ws/product-explorer"),
    });
    const w = result.current;
    expect(w("/product-explorer")).toBe("/t/ws/product-explorer");
    expect(w("/requirements/r1")).toBe("/t/ws/requirements/r1");
    expect(w("/products/p1/board-settings?boardId=b")).toBe("/t/ws/products/p1/board-settings?boardId=b");
  });
});
