import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ExecutionBoardPage } from "./ExecutionBoardPage";
import { api } from "../lib/api";
import type { ProductWithHierarchy } from "../types/models";

vi.mock("../lib/api", () => ({
  api: {
    getProducts: vi.fn(),
    getExecutionBoards: vi.fn(),
    updateRequirement: vi.fn(),
    saveExecutionBoardLayout: vi.fn()
  }
}));

const mockApi = api as unknown as {
  getProducts: ReturnType<typeof vi.fn>;
  getExecutionBoards: ReturnType<typeof vi.fn>;
  updateRequirement: ReturnType<typeof vi.fn>;
  saveExecutionBoardLayout: ReturnType<typeof vi.fn>;
};

function minimalProduct(overrides?: Partial<ProductWithHierarchy>): ProductWithHierarchy {
  return {
    id: "p1",
    name: "Alpha",
    sortOrder: 0,
    itemType: "PRODUCT",
    initiatives: [
      {
        id: "i1",
        productId: "p1",
        product: { id: "p1", name: "Alpha", sortOrder: 0 },
        title: "Init",
        domainId: "d1",
        domain: { id: "d1", name: "D", color: "#000", sortOrder: 0 },
        priority: "P1",
        horizon: "NOW",
        status: "IN_PROGRESS",
        commercialType: "CONTRACT_ENABLER",
        features: [
          {
            id: "f1",
            initiativeId: "i1",
            title: "Feat",
            status: "IDEA",
            sortOrder: 0,
            requirements: [
              {
                id: "r1",
                featureId: "f1",
                title: "Task One",
                isDone: false,
                priority: "P2",
                sortOrder: 0
              },
              {
                id: "r2",
                featureId: "f1",
                title: "Other Task",
                isDone: false,
                priority: "P2",
                sortOrder: 1
              }
            ]
          }
        ]
      }
    ],
    ...overrides
  };
}

const defaultBoardPayload = {
  boards: [
    {
      id: "b1",
      productId: "p1",
      name: "Delivery",
      provider: "INTERNAL" as const,
      isDefault: true,
      syncState: "HEALTHY" as const,
      columns: [
        {
          id: "c1",
          boardId: "b1",
          name: "Open",
          sortOrder: 0,
          mappedStatus: "NOT_STARTED" as const,
          isDefault: true
        },
        {
          id: "c2",
          boardId: "b1",
          name: "Done",
          sortOrder: 1,
          mappedStatus: "DONE" as const,
          isDefault: false
        }
      ]
    }
  ]
};

function renderBoard(path = "/products/p1/execution-board", readOnly = true) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/products/:productId/execution-board"
          element={<ExecutionBoardPage readOnly={readOnly} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("ExecutionBoardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getProducts.mockResolvedValue({ products: [minimalProduct()] });
    mockApi.getExecutionBoards.mockResolvedValue(defaultBoardPayload);
    mockApi.saveExecutionBoardLayout.mockResolvedValue({ ok: true });
  });

  it("renders heading and requirement in unassigned when no column id and not done", async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Execution board");
    });
    expect(await screen.findByText("Task One")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("places done requirement in Done column when executionColumnId is missing", async () => {
    const product = minimalProduct();
    const reqs = product.initiatives[0]!.features![0]!.requirements!;
    reqs[0] = { ...reqs[0]!, isDone: true, status: "DONE" };
    mockApi.getProducts.mockResolvedValue({ products: [product] });

    renderBoard();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Execution board");
    });

    function columnShell(from: Element): HTMLElement | null {
      let el: Element | null = from;
      while (el) {
        if (
          el instanceof HTMLElement &&
          el.className.includes("min-h-[160px]") &&
          el.className.includes("w-[200px]")
        ) {
          return el;
        }
        el = el.parentElement;
      }
      return null;
    }
    const doneCols = screen.getAllByText("Done");
    const doneShell = columnShell(doneCols[0]!);
    const unassignedShell = columnShell(screen.getByText("Unassigned"));
    expect(doneShell).toBeTruthy();
    expect(unassignedShell).toBeTruthy();
    expect(await screen.findByText("Task One")).toBeInTheDocument();
    expect(within(doneShell!).getByText("Task One")).toBeInTheDocument();
    expect(within(unassignedShell!).queryByText("Task One")).toBeNull();
  });

  it("places requirement in mapped column when executionColumnId matches", async () => {
    const product = minimalProduct();
    const reqs = product.initiatives[0]!.features![0]!.requirements!;
    reqs[0] = { ...reqs[0]!, executionColumnId: "c1" };
    reqs[1] = { ...reqs[1]!, executionColumnId: "c2" };
    mockApi.getProducts.mockResolvedValue({ products: [product] });

    renderBoard();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Execution board");
    });

    const openCols = screen.getAllByText("Open");
    expect(openCols.length).toBeGreaterThan(0);
    const doneCols = screen.getAllByText("Done");
    expect(doneCols.length).toBeGreaterThan(0);

    expect(await screen.findByText("Task One")).toBeInTheDocument();
    expect(screen.getByText("Other Task")).toBeInTheDocument();

    function columnShell(from: Element): HTMLElement | null {
      let el: Element | null = from;
      while (el) {
        if (
          el instanceof HTMLElement &&
          el.className.includes("min-h-[160px]") &&
          el.className.includes("w-[200px]")
        ) {
          return el;
        }
        el = el.parentElement;
      }
      return null;
    }
    const openShell = columnShell(openCols[0]!);
    const doneShell = columnShell(doneCols[0]!);
    const unassignedShell = columnShell(screen.getByText("Unassigned"));
    expect(openShell).toBeTruthy();
    expect(doneShell).toBeTruthy();
    expect(unassignedShell).toBeTruthy();
    expect(within(openShell!).getByText("Task One")).toBeInTheDocument();
    expect(within(doneShell!).getByText("Other Task")).toBeInTheDocument();
    expect(within(unassignedShell!).queryByText("Task One")).toBeNull();
  });

  it("sends orphan executionColumnId to Unassigned when requirement is not done", async () => {
    const product = minimalProduct();
    const reqs = product.initiatives[0]!.features![0]!.requirements!;
    reqs[0] = { ...reqs[0]!, executionColumnId: "unknown-col", isDone: false };
    mockApi.getProducts.mockResolvedValue({ products: [product] });

    renderBoard();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Execution board");
    });
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(await screen.findByText("Task One")).toBeInTheDocument();
  });

  it("places done requirement with orphan executionColumnId in Done column", async () => {
    const product = minimalProduct();
    const reqs = product.initiatives[0]!.features![0]!.requirements!;
    reqs[0] = {
      ...reqs[0]!,
      executionColumnId: "unknown-col",
      isDone: true,
      status: "DONE"
    };
    mockApi.getProducts.mockResolvedValue({ products: [product] });

    renderBoard();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Execution board");
    });

    function columnShell(from: Element): HTMLElement | null {
      let el: Element | null = from;
      while (el) {
        if (
          el instanceof HTMLElement &&
          el.className.includes("min-h-[160px]") &&
          el.className.includes("w-[200px]")
        ) {
          return el;
        }
        el = el.parentElement;
      }
      return null;
    }
    const doneShell = columnShell(screen.getAllByText("Done")[0]!);
    const unassignedShell = columnShell(screen.getByText("Unassigned"));
    expect(doneShell).toBeTruthy();
    expect(await screen.findByText("Task One")).toBeInTheDocument();
    expect(within(doneShell!).getByText("Task One")).toBeInTheDocument();
    expect(within(unassignedShell!).queryByText("Task One")).toBeNull();
  });

  it("labels product as System when itemType is SYSTEM", async () => {
    mockApi.getProducts.mockResolvedValue({
      products: [minimalProduct({ itemType: "SYSTEM" })]
    });
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText(/System:\s*Alpha/)).toBeInTheDocument();
    });
  });

  it("shows not found when product is absent from tree", async () => {
    mockApi.getProducts.mockResolvedValue({ products: [] });
    mockApi.getExecutionBoards.mockResolvedValue({ boards: [] });
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /back to products/i })).toHaveAttribute(
      "href",
      "/product-explorer"
    );
  });

  it("shows no-board callout when boards list is empty", async () => {
    mockApi.getExecutionBoards.mockResolvedValue({ boards: [] });
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText(/no execution board/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /create a board in settings/i })).toHaveAttribute(
      "href",
      "/products/p1/board-settings"
    );
  });

  it("shows board selector when multiple boards exist", async () => {
    mockApi.getExecutionBoards.mockResolvedValue({
      boards: [
        { ...defaultBoardPayload.boards[0]!, name: "Primary", isDefault: true },
        {
          id: "b2",
          productId: "p1",
          name: "Secondary",
          provider: "INTERNAL" as const,
          isDefault: false,
          syncState: "HEALTHY" as const,
          columns: [
            {
              id: "x1",
              boardId: "b2",
              name: "Only",
              sortOrder: 0,
              mappedStatus: "NOT_STARTED" as const,
              isDefault: true
            }
          ]
        }
      ]
    });
    renderBoard();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Execution board");
    });
    const boardSelect = screen
      .getAllByRole("combobox")
      .find((el) => within(el).queryByRole("option", { name: /Secondary/ }));
    expect(boardSelect).toBeDefined();
    expect(within(boardSelect!).getByRole("option", { name: /Primary/ })).toBeInTheDocument();
    expect(within(boardSelect!).getByRole("option", { name: /Secondary/ })).toBeInTheDocument();
  });

  it("shows loading until APIs resolve", async () => {
    let resolveProducts!: (v: { products: ProductWithHierarchy[] }) => void;
    const productsPromise = new Promise<{ products: ProductWithHierarchy[] }>((r) => {
      resolveProducts = r;
    });
    mockApi.getProducts.mockImplementation(() => productsPromise);
    mockApi.getExecutionBoards.mockResolvedValue(defaultBoardPayload);

    renderBoard();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    resolveProducts({ products: [minimalProduct()] });
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Execution board");
    });
  });

  it("renders board settings link with boardId query when board selected", async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Execution board");
    });
    const settings = screen.getByRole("link", { name: /board settings/i });
    expect(settings.getAttribute("href")).toContain("boardId=b1");
  });
});
