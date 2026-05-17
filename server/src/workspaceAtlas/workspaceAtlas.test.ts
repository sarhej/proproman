import { describe, expect, it } from "vitest";
import { objectShardFile } from "./paths.js";
import { parseWorkspaceAtlas } from "./zodSchemas.js";
import { searchWorkspaceAtlas } from "./search.js";

const minimalAtlas = {
  schemaVersion: "2",
  tenantId: "t1",
  workspaceSlug: "acme",
  materializedAt: "2026-01-01T00:00:00.000Z",
  sourceMaxUpdatedAt: "2026-01-01T00:00:00.000Z",
  domains: [{ id: "d1", name: "Platform", color: "#000", sortOrder: 0 }],
  products: [{ id: "p1", name: "Tymio", slug: "tymio", sortOrder: 0 }],
  initiativeIndex: [
    {
      id: "i1",
      title: "Ship Atlas",
      domainId: "d1",
      productId: "p1",
      status: "ACTIVE",
      horizon: "H1",
      priority: "P1",
      archivedAt: null
    }
  ],
  featureIndex: [{ id: "f1", title: "MCP tools", initiativeId: "i1", status: "IDEA" }],
  requirementIndex: [{ id: "r1", title: "Write tests", featureId: "f1", status: "NOT_STARTED" }],
  objectCounts: {
    domain: 1,
    product: 1,
    initiative: 1,
    feature: 1,
    requirement: 1
  },
  capabilityOntology: {
    kind: "pointer",
    note: "Use tymio_get_agent_brief"
  },
  backlogOntology: {
    kind: "reference",
    spine: "Domain -> Initiative -> Feature -> Requirement"
  }
};

describe("workspaceAtlas zod", () => {
  it("parses minimal atlas", () => {
    const parsed = parseWorkspaceAtlas(minimalAtlas);
    expect(parsed.tenantId).toBe("t1");
  });
});

describe("searchWorkspaceAtlas", () => {
  it("finds substring hits", () => {
    const atlas = parseWorkspaceAtlas(minimalAtlas);
    const hits = searchWorkspaceAtlas(atlas, "atlas", 10);
    expect(hits.some((h) => h.objectType === "INITIATIVE" && h.id === "i1")).toBe(true);
  });
});

describe("objectShardFile path safety", () => {
  const tenantId = "cmnq2w46y0000pxu7l5w0rnem";

  it("rejects traversal-like object ids", () => {
    expect(() =>
      objectShardFile(tenantId, "INITIATIVE", "../../../cmevil/workspace-atlas")
    ).toThrow(/invalid id format/);
  });

  it("accepts Prisma cuid object ids", () => {
    const initiativeId = "cmnq2wnth0001pxhk5mthpaar";
    const file = objectShardFile(tenantId, "INITIATIVE", initiativeId);
    expect(file).toContain(initiativeId);
    expect(file).not.toContain("..");
  });

  it("rejects invalid object type directories", () => {
    expect(() => objectShardFile(tenantId, "INITIATIVE/../../../etc", "cmnq2wnth0001pxhk5mthpaar")).toThrow(
      /Invalid atlas object type/
    );
  });
});
