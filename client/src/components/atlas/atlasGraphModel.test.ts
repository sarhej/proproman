import { describe, expect, it } from "vitest";
import {
  NO_PRODUCT_ID,
  buildDomainTree,
  buildTopicGraph,
  filterDomainTree,
  findSelectionLabel
} from "./atlasGraphModel";

const atlas = {
  domains: [
    { id: "d1", name: "Platform", color: "#000", sortOrder: 0 },
    { id: "d2", name: "Market", color: "#111", sortOrder: 1 }
  ],
  products: [
    { id: "p1", name: "Web App", slug: "web", sortOrder: 0 },
    { id: "p2", name: "CLI", slug: "cli", sortOrder: 1 }
  ],
  initiativeIndex: [
    {
      id: "i1",
      title: "Atlas core",
      domainId: "d1",
      productId: "p1",
      status: "IN_PROGRESS",
      horizon: "NOW",
      priority: "P0"
    },
    {
      id: "i2",
      title: "Wiki",
      domainId: "d2",
      productId: "p1",
      status: "PLANNED",
      horizon: "NOW",
      priority: "P1"
    }
  ],
  featureIndex: [
    { id: "f1", title: "Graph explorer", initiativeId: "i1", status: "IN_PROGRESS" },
    { id: "f2", title: "Public pages", initiativeId: "i2", status: "PLANNED" }
  ],
  requirementIndex: [
    { id: "r1", title: "Domain spine tree", featureId: "f1", status: "IN_PROGRESS" },
    { id: "r2", title: "Topic edges", featureId: "f1", status: "NOT_STARTED" }
  ],
  architectureTopicIndex: [{ id: "t1", slug: "multi", title: "Multitenancy", sortOrder: 0 }]
};

describe("atlasGraphModel", () => {
  it("builds domain → product → initiative → feature → requirement tree", () => {
    const tree = buildDomainTree(atlas);
    expect(tree).toHaveLength(2);
    expect(tree[0].products[0].initiatives[0].features[0].requirements).toHaveLength(2);
  });

  it("filters tree by requirement title", () => {
    const tree = buildDomainTree(atlas);
    const filtered = filterDomainTree(tree, "topic edges");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Platform");
    expect(filtered[0].products[0].initiatives[0].features[0].requirements).toHaveLength(1);
  });

  it("maps topic edges to initiative titles", () => {
    const initiativeTitleById = new Map(atlas.initiativeIndex.map((i) => [i.id, i.title]));
    const topics = buildTopicGraph(
      atlas.architectureTopicIndex!,
      initiativeTitleById,
      new Map([["t1", ["i1"]]])
    );
    expect(topics[0].linkedInitiatives[0].initiativeTitle).toBe("Atlas core");
  });

  it("resolves selection labels", () => {
    expect(findSelectionLabel(atlas, { kind: "requirement", id: "r1" })).toBe("Domain spine tree");
    expect(findSelectionLabel(atlas, { kind: "product", id: NO_PRODUCT_ID })).toBeNull();
  });
});
