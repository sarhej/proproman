import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { WikiArticlePage } from "./WikiArticlePage";

describe("WikiArticlePage", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/wiki/index.json")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            title: "W",
            description: "D",
            pages: [{ slug: "openclaw", title: "OpenClaw", file: "articles/openclaw.md" }],
          }),
        } as Response);
      }
      if (url.endsWith("/wiki/articles/openclaw.md")) {
        return Promise.resolve({
          ok: true,
          text: async () => "# Hello\n\nBody **bold**.",
        } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders markdown from resolved article path", async () => {
    render(
      <MemoryRouter initialEntries={["/wiki/openclaw"]}>
        <Routes>
          <Route path="/wiki/:slug" element={<WikiArticlePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
  });
});
