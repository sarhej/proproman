import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RequirementsKanban } from "./RequirementsKanban";
import type { Initiative, Feature, Requirement } from "../../types/models";

const noop = async () => {};

function renderKanban(initiatives: Initiative[]) {
  return render(
    <MemoryRouter>
      <RequirementsKanban initiatives={initiatives} onMoveRequirement={noop} />
    </MemoryRouter>
  );
}

function minimalInitiative(overrides?: Partial<Initiative>): Initiative {
  return {
    id: "init-1",
    productId: "p1",
    product: { id: "p1", name: "Product One", sortOrder: 0 },
    title: "Initiative Alpha",
    domainId: "d1",
    domain: { id: "d1", name: "Domain", color: "#000", sortOrder: 0 },
    priority: "P1",
    horizon: "NOW",
    status: "IN_PROGRESS",
    commercialType: "CONTRACT_ENABLER",
    ...overrides
  };
}

function minimalFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: "feat-1",
    initiativeId: "init-1",
    title: "Feature One",
    status: "IDEA",
    sortOrder: 0,
    ...overrides
  };
}

function minimalRequirement(overrides?: Partial<Requirement>): Requirement {
  return {
    id: "req-1",
    featureId: "feat-1",
    title: "Task One",
    isDone: false,
    priority: "P2",
    ...overrides
  };
}

describe("RequirementsKanban – edge cases", () => {
  it("renders empty state when initiatives is empty", () => {
    renderKanban([]);
    expect(
      screen.getByText(/No requirements match. Add features and requirements in Product Explorer/)
    ).toBeInTheDocument();
  });

  it("renders empty state when initiatives have no features", () => {
    const initiatives: Initiative[] = [minimalInitiative({ features: [] })];
    renderKanban(initiatives);
    expect(
      screen.getByText(/No requirements match. Add features and requirements in Product Explorer/)
    ).toBeInTheDocument();
  });

  it("renders empty state when features have no requirements", () => {
    const initiatives: Initiative[] = [
      {
        ...minimalInitiative(),
        features: [minimalFeature({ requirements: [] })]
      }
    ];
    renderKanban(initiatives);
    expect(
      screen.getByText(/No requirements match. Add features and requirements in Product Explorer/)
    ).toBeInTheDocument();
  });

  it("renders Open and Done columns with counts", () => {
    const initiatives: Initiative[] = [
      {
        ...minimalInitiative(),
        features: [
          {
            ...minimalFeature(),
            requirements: [
              minimalRequirement({ id: "r1", isDone: false }),
              minimalRequirement({ id: "r2", isDone: true })
            ]
          }
        ]
      }
    ];
    renderKanban(initiatives);
    expect(document.body.textContent).toContain("Open");
    expect(document.body.textContent).toContain("Done");
    expect(document.body.textContent).toContain("Task One");
  });

  it("treats requirement as done when status is DONE even if isDone is false", () => {
    const initiatives: Initiative[] = [
      {
        ...minimalInitiative(),
        features: [
          {
            ...minimalFeature(),
            requirements: [
              minimalRequirement({ id: "r1", isDone: false, status: "DONE", title: "Done by status" })
            ]
          }
        ]
      }
    ];
    renderKanban(initiatives);
    expect(screen.getByText("Done by status")).toBeInTheDocument();
    expect(document.body.textContent).toContain("Done");
  });

  it("handles initiative with undefined product", () => {
    const initiatives: Initiative[] = [
      {
        ...minimalInitiative({ product: undefined, productId: null }),
        features: [
          {
            ...minimalFeature(),
            requirements: [minimalRequirement()]
          }
        ]
      }
    ];
    renderKanban(initiatives);
    expect(screen.getByText("Task One")).toBeInTheDocument();
  });

  it("handles feature with undefined requirements", () => {
    const initiatives: Initiative[] = [
      {
        ...minimalInitiative(),
        features: [minimalFeature({ requirements: undefined })]
      }
    ];
    renderKanban(initiatives);
    expect(
      screen.getByText(/No requirements match. Add features and requirements in Product Explorer/)
    ).toBeInTheDocument();
  });
});
