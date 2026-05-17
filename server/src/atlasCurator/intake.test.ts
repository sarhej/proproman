import { describe, it, expect, vi, beforeEach } from "vitest";
import { AtlasCuratorProposalStatus } from "@prisma/client";

const hoisted = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn()
}));

vi.mock("../db.js", () => ({
  prisma: {
    atlasCuratorProposal: {
      findMany: hoisted.findMany,
      create: hoisted.create
    }
  }
}));

import { intakeCuratorProposals } from "./intake.js";

function mockDb() {
  return {
    atlasCuratorProposal: {
      findMany: hoisted.findMany,
      create: hoisted.create
    }
  } as unknown as import("../db.js").ExtendedPrismaClient;
}

const topic = {
  lockedFields: ["toBeSummary"],
  asIsSummary: "old summary",
  toBeSummary: "planned",
  title: "Multitenancy",
  synonyms: null,
  docPaths: null,
  slug: "multitenancy"
};

describe("intakeCuratorProposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.findMany.mockResolvedValue([]);
    hoisted.create.mockImplementation(async (args: {
      data: { proposalType: string; fieldPath: string | null; proposedValue: unknown };
    }) => ({
      id: "p-new",
      proposalType: args.data.proposalType,
      fieldPath: args.data.fieldPath,
      proposedValue: args.data.proposedValue
    }));
  });

  it("skips locked field patches", async () => {
    const result = await intakeCuratorProposals(mockDb(), "topic-1", topic, [
      {
        proposalType: "TOPIC_LAYER_PATCH",
        proposedValue: { field: "toBeSummary", value: "new" },
        sources: [{ kind: "doc", ref: "docs/HUB.md" }]
      }
    ]);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.results[0]).toMatchObject({ status: "skipped", reason: "locked_field" });
    expect(hoisted.create).not.toHaveBeenCalled();
  });

  it("creates gap report on locked topic", async () => {
    hoisted.create.mockResolvedValueOnce({
      id: "gap-1",
      proposalType: "GAP_REPORT",
      fieldPath: null,
      proposedValue: { kind: "x", message: "y" }
    });
    const result = await intakeCuratorProposals(mockDb(), "topic-1", topic, [
      {
        proposalType: "GAP_REPORT",
        proposedValue: { kind: "missing_docs", message: "Add doc paths" },
        sources: [{ kind: "other", ref: "gaps" }]
      }
    ]);
    expect(result.created).toBe(1);
    expect(hoisted.create).toHaveBeenCalledOnce();
  });

  it("skips duplicate pending proposals", async () => {
    const proposedValue = { field: "asIsSummary", value: "updated" };
    hoisted.findMany.mockResolvedValueOnce([
      {
        proposalType: "TOPIC_LAYER_PATCH",
        fieldPath: "asIsSummary",
        proposedValue,
        status: AtlasCuratorProposalStatus.PENDING
      }
    ]);
    const result = await intakeCuratorProposals(mockDb(), "topic-1", topic, [
      {
        proposalType: "TOPIC_LAYER_PATCH",
        proposedValue,
        sources: [{ kind: "doc", ref: "docs/HUB.md" }]
      }
    ]);
    expect(result.skipped).toBe(1);
    expect(result.results[0]).toMatchObject({ reason: "duplicate_pending" });
  });
});
