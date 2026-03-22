import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProductTree } from "./ProductTree";
import { api } from "../../lib/api";
import type { Domain, ProductWithHierarchy } from "../../types/models";

vi.mock("../../lib/api", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...mod,
    api: {
      ...mod.api,
      createExecutionBoard: vi.fn().mockResolvedValue({ board: { id: "nb" } })
    }
  };
});

const mockCreateBoard = api.createExecutionBoard as ReturnType<typeof vi.fn>;

const domain: Domain = { id: "d1", name: "Pillar", color: "#111", sortOrder: 0 };

function baseProduct(overrides?: Partial<ProductWithHierarchy>): ProductWithHierarchy {
  return {
    id: "p1",
    name: "Product One",
    sortOrder: 0,
    itemType: "PRODUCT",
    initiatives: [],
    ...overrides
  };
}

describe("ProductTree – execution board entry points", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Open board and Board settings when executionBoards exist", () => {
    render(
      <MemoryRouter>
        <ProductTree
          products={[
            baseProduct({
              executionBoards: [
                {
                  id: "b1",
                  productId: "p1",
                  name: "Main",
                  provider: "INTERNAL",
                  isDefault: true,
                  syncState: "HEALTHY",
                  columns: []
                }
              ]
            })
          ]}
          users={[]}
          domains={[domain]}
          isAdmin={false}
          canCreateInitiative={true}
          currentUserId={null}
          onOpenInitiative={() => {}}
          onRefresh={async () => {}}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: /open board/i })).toHaveAttribute(
      "href",
      "/products/p1/execution-board"
    );
    expect(screen.getByRole("link", { name: /board settings/i })).toHaveAttribute(
      "href",
      "/products/p1/board-settings"
    );
  });

  it("shows create board when no boards and user can create initiatives", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <ProductTree
          products={[baseProduct({ executionBoards: [] })]}
          users={[]}
          domains={[domain]}
          isAdmin={false}
          canCreateInitiative={true}
          currentUserId={null}
          onOpenInitiative={() => {}}
          onRefresh={onRefresh}
        />
      </MemoryRouter>
    );
    const btn = screen.getByRole("button", { name: /create board/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(mockCreateBoard).toHaveBeenCalledWith("p1", expect.objectContaining({ name: expect.any(String) }));
    });
    expect(onRefresh).toHaveBeenCalled();
  });

  it("does not offer create board when user cannot create initiatives", () => {
    render(
      <MemoryRouter>
        <ProductTree
          products={[baseProduct({ executionBoards: [] })]}
          users={[]}
          domains={[domain]}
          isAdmin={false}
          canCreateInitiative={false}
          currentUserId={null}
          onOpenInitiative={() => {}}
          onRefresh={async () => {}}
        />
      </MemoryRouter>
    );
    expect(screen.queryByRole("button", { name: /create board/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /board settings/i })).not.toBeInTheDocument();
  });

  it("shows System badge when itemType is SYSTEM", () => {
    render(
      <MemoryRouter>
        <ProductTree
          products={[
            baseProduct({
              itemType: "SYSTEM",
              executionBoards: [
                {
                  id: "b1",
                  productId: "p1",
                  name: "Main",
                  provider: "INTERNAL",
                  isDefault: true,
                  syncState: "HEALTHY",
                  columns: []
                }
              ]
            })
          ]}
          users={[]}
          domains={[domain]}
          isAdmin={false}
          canCreateInitiative={true}
          currentUserId={null}
          onOpenInitiative={() => {}}
          onRefresh={async () => {}}
        />
      </MemoryRouter>
    );
    expect(screen.getByText("System")).toBeInTheDocument();
  });
});
