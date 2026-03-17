import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequirementDetailPage } from "./RequirementDetailPage";
import type { Initiative, Feature, Requirement, Product } from "../types/models";

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
          path="/requirements/:requirementId?"
          element={
            <RequirementDetailPage
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

describe("RequirementDetailPage – edge cases", () => {
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
  const requirement: Requirement = {
    id: "req-1",
    featureId: "feat-1",
    title: "Requirement One",
    isDone: false,
    priority: "P2"
  };
  const initiativesWithRequirement: Initiative[] = [
    {
      ...initiative,
      features: [{ ...feature, requirements: [requirement] }]
    }
  ];

  it("shows 'Missing requirement ID' when route param is missing", () => {
    renderWithRoute("/requirements", []);
    expect(screen.getByText("Missing requirement ID.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to product explorer/i })).toHaveAttribute(
      "href",
      "/product-explorer"
    );
  });

  it("shows 'Requirement not found' when requirementId is not in initiatives", () => {
    renderWithRoute("/requirements/non-existent-id", []);
    expect(screen.getByText("Requirement not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to product explorer/i })).toHaveAttribute(
      "href",
      "/product-explorer"
    );
  });

  it("shows 'Requirement not found' when initiatives is empty", () => {
    renderWithRoute("/requirements/req-1", []);
    expect(screen.getByText("Requirement not found.")).toBeInTheDocument();
  });

  it("renders requirement title and breadcrumb when requirement is found", () => {
    renderWithRoute("/requirements/req-1", initiativesWithRequirement);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Requirement One");
    expect(document.body.textContent).toContain("Product One");
    expect(document.body.textContent).toContain("Initiative Alpha");
    const featureLinks = screen.getAllByRole("link", { name: "Feature One" });
    expect(featureLinks.some((el) => el.getAttribute("href") === "/features/feat-1")).toBe(true);
  });

  it("treats requirement as done when status is DONE (even if isDone false)", () => {
    const reqDone: Requirement = { ...requirement, id: "req-done", status: "DONE", isDone: false };
    const initiatives: Initiative[] = [
      {
        ...initiative,
        features: [{ ...feature, id: "f2", requirements: [reqDone] }]
      }
    ];
    renderWithRoute("/requirements/req-done", initiatives);
    expect(document.body.textContent).toContain("Done");
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
  });

  it("does not show 'Other tasks in this feature' when no siblings", () => {
    renderWithRoute("/requirements/req-1", initiativesWithRequirement);
    expect(screen.queryByText("Other tasks in this feature")).not.toBeInTheDocument();
  });

  it("shows sibling requirements when present", () => {
    const req2: Requirement = {
      id: "req-2",
      featureId: "feat-1",
      title: "Requirement Two",
      isDone: false,
      priority: "P2"
    };
    const initiatives: Initiative[] = [
      {
        ...initiative,
        features: [{ ...feature, requirements: [requirement, req2] }]
      }
    ];
    renderWithRoute("/requirements/req-1", initiatives);
    expect(screen.getByText("Other tasks in this feature")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Requirement Two" })).toHaveAttribute("href", "/requirements/req-2");
  });

  it("handles initiative with undefined features array", () => {
    const initiatives: Initiative[] = [{ ...initiative, features: undefined }];
    renderWithRoute("/requirements/req-1", initiatives);
    expect(screen.getByText("Requirement not found.")).toBeInTheDocument();
  });
});
