import { describe, expect, it } from "vitest";
import {
  AtlasCuratorProposalStatus,
  AtlasCuratorProposalType,
  type ArchitectureTopic
} from "@prisma/client";
import { applyAcceptedProposal, ProposalApplyError } from "./applyProposal.js";

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "prop-1",
    tenantId: "t1",
    proposalType: AtlasCuratorProposalType.TOPIC_LAYER_PATCH,
    status: AtlasCuratorProposalStatus.PENDING,
    architectureTopicId: "topic-1",
    fieldPath: "asIsSummary",
    currentValue: null,
    proposedValue: { field: "asIsSummary", value: "Updated as-is text" },
    sources: [{ kind: "doc", ref: "docs/HUB.md" }],
    confidence: 0.9,
    createdByAgent: "atlas-curator",
    reviewReason: null,
    reviewerId: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function makeTopic(overrides: Partial<ArchitectureTopic> = {}): ArchitectureTopic {
  return {
    id: "topic-1",
    tenantId: "t1",
    slug: "multitenancy",
    title: "Multitenancy",
    asIsSummary: "Old summary",
    toBeSummary: null,
    synonyms: null,
    docPaths: null,
    autoMatchCapabilities: true,
    lockedFields: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

describe("applyAcceptedProposal", () => {
  it("applies topic layer patch when field is not locked", async () => {
    const updates: unknown[] = [];
    const tx = {
      architectureTopic: {
        findUnique: async () => makeTopic(),
        update: async ({ data }: { data: { asIsSummary?: string } }) => {
          updates.push(data);
        }
      }
    };
    await applyAcceptedProposal(tx as never, makeProposal() as never);
    expect(updates[0]).toEqual({ asIsSummary: "Updated as-is text" });
  });

  it("rejects locked fields", async () => {
    const tx = {
      architectureTopic: {
        findUnique: async () => makeTopic({ lockedFields: ["asIsSummary"] })
      }
    };
    await expect(applyAcceptedProposal(tx as never, makeProposal() as never)).rejects.toMatchObject({
      code: "LOCKED"
    } satisfies Partial<ProposalApplyError>);
  });

  it("adds initiative link", async () => {
    const upserts: unknown[] = [];
    const tx = {
      architectureTopic: {
        findUnique: async () => makeTopic()
      },
      architectureTopicInitiative: {
        upsert: async (args: unknown) => {
          upserts.push(args);
        }
      }
    };
    await applyAcceptedProposal(
      tx as never,
      makeProposal({
        proposalType: AtlasCuratorProposalType.LINK_PROPOSAL,
        proposedValue: { linkType: "initiative", action: "add", targetId: "init-1" }
      }) as never
    );
    expect(upserts).toHaveLength(1);
  });

  it("no-ops GAP_REPORT", async () => {
    const tx = {
      architectureTopic: { findUnique: async () => makeTopic() }
    };
    await expect(
      applyAcceptedProposal(
        tx as never,
        makeProposal({
          proposalType: AtlasCuratorProposalType.GAP_REPORT,
          proposedValue: { kind: "missing-doc", message: "No doc for auth" }
        }) as never
      )
    ).resolves.toBeUndefined();
  });
});
