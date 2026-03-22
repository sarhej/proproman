import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BoardSettingsPage } from "./BoardSettingsPage";
import { api } from "../lib/api";
import type { ProductWithHierarchy, ExecutionBoard } from "../types/models";

vi.mock("../lib/api", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../lib/api")>();
  return {
    ...mod,
    api: {
      ...mod.api,
      getProducts: vi.fn(),
      getExecutionBoards: vi.fn(),
      createExecutionBoard: vi.fn().mockResolvedValue({ board: { id: "new-b" } })
    }
  };
});

const mockApi = api as unknown as {
  getProducts: ReturnType<typeof vi.fn>;
  getExecutionBoards: ReturnType<typeof vi.fn>;
  createExecutionBoard: ReturnType<typeof vi.fn>;
};

function product(): ProductWithHierarchy {
  return {
    id: "p1",
    name: "Alpha",
    sortOrder: 0,
    itemType: "PRODUCT",
    initiatives: []
  };
}

function boardWithColumns(): ExecutionBoard {
  return {
    id: "b1",
    productId: "p1",
    name: "Delivery",
    provider: "INTERNAL",
    isDefault: true,
    syncState: "HEALTHY",
    columns: [
      {
        id: "c1",
        boardId: "b1",
        name: "Todo",
        sortOrder: 0,
        mappedStatus: "NOT_STARTED",
        isDefault: true
      }
    ]
  };
}

function renderSettings(isAdmin: boolean) {
  return render(
    <MemoryRouter initialEntries={["/products/p1/board-settings"]}>
      <Routes>
        <Route
          path="/products/:productId/board-settings"
          element={<BoardSettingsPage isAdmin={isAdmin} onRefreshBoard={async () => {}} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("BoardSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getProducts.mockResolvedValue({ products: [product()] });
    mockApi.getExecutionBoards.mockResolvedValue({ boards: [boardWithColumns()] });
  });

  it("shows board settings title and column table", async () => {
    renderSettings(true);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Board settings");
    });
    expect(screen.getByText("Columns")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Todo")).toBeInTheDocument();
  });

  it("shows product not found when id missing from tree", async () => {
    mockApi.getProducts.mockResolvedValue({ products: [] });
    mockApi.getExecutionBoards.mockResolvedValue({ boards: [] });
    renderSettings(true);
    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });

  it("shows empty state with create when no boards and user is admin", async () => {
    mockApi.getExecutionBoards.mockResolvedValue({ boards: [] });
    renderSettings(true);
    await waitFor(() => {
      expect(screen.getByText(/no execution board/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /create board/i })).toBeInTheDocument();
  });

  it("hides create board button when not admin and no boards", async () => {
    mockApi.getExecutionBoards.mockResolvedValue({ boards: [] });
    renderSettings(false);
    await waitFor(() => {
      expect(screen.getByText(/no execution board/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /create board/i })).not.toBeInTheDocument();
  });

  it("calls createExecutionBoard when admin clicks create", async () => {
    mockApi.getExecutionBoards.mockResolvedValue({ boards: [] });
    renderSettings(true);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create board/i })).toBeInTheDocument();
    });
    screen.getByRole("button", { name: /create board/i }).click();
    await waitFor(() => {
      expect(mockApi.createExecutionBoard).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ name: expect.any(String), isDefault: true })
      );
    });
  });

  it("links back to execution board with boardId when board exists", async () => {
    renderSettings(true);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Board settings");
    });
    const openBoard = screen.getByRole("link", { name: /open board/i });
    expect(openBoard.getAttribute("href")).toContain("/products/p1/execution-board");
    expect(openBoard.getAttribute("href")).toContain("boardId=b1");
  });
});
