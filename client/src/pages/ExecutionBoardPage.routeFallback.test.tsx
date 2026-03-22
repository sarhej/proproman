import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../lib/api", () => ({
  api: {
    getProducts: vi.fn(),
    getExecutionBoards: vi.fn(),
    updateRequirement: vi.fn()
  }
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: () => ({ productId: undefined })
  };
});

import { ExecutionBoardPage } from "./ExecutionBoardPage";
import { api } from "../lib/api";

const mockApi = api as unknown as { getProducts: ReturnType<typeof vi.fn> };

describe("ExecutionBoardPage – route without productId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows missing product and does not fetch", () => {
    render(
      <MemoryRouter initialEntries={["/products/p1/execution-board"]}>
        <Routes>
          <Route path="/products/:productId/execution-board" element={<ExecutionBoardPage readOnly />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/missing product/i)).toBeInTheDocument();
    expect(mockApi.getProducts).not.toHaveBeenCalled();
  });
});
