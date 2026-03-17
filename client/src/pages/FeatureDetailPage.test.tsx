import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FeatureDetailPage } from "./FeatureDetailPage";
import type { Initiative, Feature, Product } from "../types/models";

const noop = () => {};

function renderWithRoute(
  path: string,
  initiatives: Initiative[],
  options?: { readOnly?: boolean }
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/features/:featureId?"
          element={
            <FeatureDetailPage
              initiatives={initiatives}
              onOpenInitiative={noop}
              readOnly={options?.readOnly}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("FeatureDetailPage – edge cases", () => {
  const product: Product = { id: "p1", name: "Product One", sortOrder: 0 };
  const initiative: Initiative = {
    id: "init-1",
    productId: "p1",
    product,
    title: "Initiative Alpha",
    domainId: "d1",
    domain: { id: "d1", name: "Domain", color: "#000", sortOrder: 0 },
    priority: "P1",
    horizon: "NOW",
    status: "IN_PROGRESS",
    commercialType: "CONTRACT_ENABLER"
  };
  const feature: Feature = {
    id: "feat-1",
    initiativeId: "init-1",
    title: "Feature One",
    status: "IDEA",
    sortOrder: 0,
    requirements: []
  };
  const initiativesWithFeature: Initiative[] = [
    { ...initiative, features: [feature] }
  ];

  it("shows 'Missing feature ID' when route param is missing", () => {
    renderWithRoute("/features", []);
    expect(screen.getByText("Missing feature ID.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to product explorer/i })).toHaveAttribute(
      "href",
      "/product-explorer"
    );
  });

  it("shows 'Feature not found' when featureId is not in initiatives", () => {
    renderWithRoute("/features/non-existent-id", []);
    expect(screen.getByText("Feature not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to product explorer/i })).toHaveAttribute(
      "href",
      "/product-explorer"
    );
  });

  it("shows 'Feature not found' when initiatives is empty but featureId is present", () => {
    renderWithRoute("/features/feat-1", []);
    expect(screen.getByText("Feature not found.")).toBeInTheDocument();
  });

  it("renders feature title and breadcrumb when feature is found", () => {
    renderWithRoute("/features/feat-1", initiativesWithFeature);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Feature One");
    expect(document.body.textContent).toContain("Product One");
    expect(document.body.textContent).toContain("Initiative Alpha");
  });

  it("shows Requirements (0/0) when feature has no requirements", () => {
    renderWithRoute("/features/feat-1", initiativesWithFeature);
    expect(screen.getByText(/Requirements \(0\/0\)/)).toBeInTheDocument();
  });

  it("shows requirement count and done count when feature has requirements", () => {
    const withReqs: Initiative[] = [
      {
        ...initiative,
        features: [
          {
            ...feature,
            requirements: [
              {
                id: "req-1",
                featureId: "feat-1",
                title: "Task A",
                isDone: true,
                priority: "P1",
                status: "DONE"
              },
              {
                id: "req-2",
                featureId: "feat-1",
                title: "Task B",
                isDone: false,
                priority: "P2"
              }
            ]
          }
        ]
      }
    ];
    renderWithRoute("/features/feat-1", withReqs);
    expect(screen.getByText(/Requirements \(1\/2\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Task A" })).toHaveAttribute("href", "/requirements/req-1");
    expect(screen.getByRole("link", { name: "Task B" })).toHaveAttribute("href", "/requirements/req-2");
  });

  it("handles initiative with undefined product (shows — for product name)", () => {
    const initNoProduct: Initiative[] = [
      { ...initiative, product: undefined, productId: null, features: [feature] }
    ];
    renderWithRoute("/features/feat-1", initNoProduct);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Feature One");
    expect(document.body.textContent).toContain("Initiative Alpha");
  });

  it("handles feature with undefined requirements array", () => {
    const featNoReqs: Feature = { ...feature, requirements: undefined };
    const initiatives: Initiative[] = [{ ...initiative, features: [featNoReqs] }];
    renderWithRoute("/features/feat-1", initiatives);
    expect(screen.getByText(/Requirements \(0\/0\)/)).toBeInTheDocument();
  });
});
