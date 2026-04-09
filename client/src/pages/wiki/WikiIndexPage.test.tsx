import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { WikiIndexPage } from "./WikiIndexPage";

describe("WikiIndexPage", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/wiki/index.json")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            title: "Test Wiki",
            description: "Test description",
            pages: [{ slug: "openclaw", title: "OpenClaw", file: "articles/openclaw.md" }],
          }),
        } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders index title and page links from index.json", async () => {
    render(
      <MemoryRouter initialEntries={["/wiki"]}>
        <Routes>
          <Route path="/wiki" element={<WikiIndexPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Test Wiki" })).toBeInTheDocument();
    expect(screen.getByText("Test description")).toBeInTheDocument();
    const link = await screen.findByRole("link", { name: "OpenClaw" });
    expect(link).toHaveAttribute("href", "/wiki/openclaw");
  });
});
