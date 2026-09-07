import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AtlasHubPage } from "./AtlasHubPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    getWorkspaceAtlas: vi.fn(),
    getWorkspaceAtlasObject: vi.fn(),
    getGitObserveHealth: vi.fn(),
    getGitObserveActivity: vi.fn(),
    getAtlasProposals: vi.fn(),
    runAtlasCurator: vi.fn(),
    acceptAtlasProposal: vi.fn(),
    rejectAtlasProposal: vi.fn()
  }
}));

vi.mock("./ArchitectureTopicsPage", () => ({
  ArchitectureTopicsPage: () => <div data-testid="topics-stub" />
}));

vi.mock("../components/atlas/AtlasGraphExplorer", () => ({
  AtlasGraphExplorer: () => <div data-testid="graph-stub" />
}));

vi.mock("../components/atlas/AtlasReviewPanel", () => ({
  AtlasReviewPanel: () => <div data-testid="review-stub" />
}));

const mockGetAtlas = vi.mocked(api.getWorkspaceAtlas);

const baseAtlas = {
  workspaceSlug: "tymio",
  materializedAt: "2026-09-07T12:00:00.000Z",
  sourceMaxUpdatedAt: "2026-09-07T12:00:00.000Z",
  domains: [],
  products: [],
  objectCounts: {
    domain: 1,
    product: 1,
    initiative: 2,
    feature: 3,
    requirement: 4,
    architectureTopic: 0
  },
  architectureTopicIndex: [],
  initiativeIndex: [],
  featureIndex: [],
  requirementIndex: []
};

function renderHub() {
  return render(
    <MemoryRouter initialEntries={["/atlas?tab=overview"]}>
      <AtlasHubPage isAdmin={false} initiatives={[]} />
    </MemoryRouter>
  );
}

describe("AtlasHubPage health visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows incomplete badge when atlas is not compiled", async () => {
    mockGetAtlas.mockResolvedValue({
      atlas: null,
      compiled: false,
      freshness: null,
      health: {
        status: "incomplete",
        pendingRebuild: false,
        compiling: false,
        lastRebuildAt: null,
        lastErrorMessage: null
      }
    });
    renderHub();
    await waitFor(() => {
      expect(screen.getByText(/no compiled atlas yet/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/^Incomplete$/i)).toBeInTheDocument();
  });

  it("shows Current badge and last rebuild for healthy atlas", async () => {
    mockGetAtlas.mockResolvedValue({
      atlas: baseAtlas,
      compiled: true,
      freshness: {
        materializedAt: baseAtlas.materializedAt,
        sourceMaxUpdatedAt: baseAtlas.sourceMaxUpdatedAt,
        workspaceSlug: "tymio",
        isStale: false,
        ageMinutes: 3
      },
      health: {
        status: "current",
        pendingRebuild: false,
        compiling: false,
        lastRebuildAt: "2026-09-07T12:00:00.000Z",
        lastErrorMessage: null
      }
    });
    renderHub();
    await waitFor(() => {
      expect(screen.getByText(/^Current$/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/compiled 3 minutes ago/i)).toBeInTheDocument();
    expect(screen.getByText(/last rebuild/i)).toBeInTheDocument();
  });

  it("shows Stale badge and stale warning", async () => {
    mockGetAtlas.mockResolvedValue({
      atlas: {
        ...baseAtlas,
        sourceMaxUpdatedAt: "2026-09-07T13:00:00.000Z"
      },
      compiled: true,
      freshness: {
        materializedAt: baseAtlas.materializedAt,
        sourceMaxUpdatedAt: "2026-09-07T13:00:00.000Z",
        workspaceSlug: "tymio",
        isStale: true,
        ageMinutes: 60
      },
      health: {
        status: "stale",
        pendingRebuild: false,
        compiling: false,
        lastRebuildAt: null,
        lastErrorMessage: null
      }
    });
    renderHub();
    await waitFor(() => {
      expect(screen.getByText(/^Stale$/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/atlas may be stale/i)).toBeInTheDocument();
  });

  it("shows Rebuilding badge while compile pending", async () => {
    mockGetAtlas.mockResolvedValue({
      atlas: baseAtlas,
      compiled: true,
      freshness: {
        materializedAt: baseAtlas.materializedAt,
        sourceMaxUpdatedAt: baseAtlas.sourceMaxUpdatedAt,
        workspaceSlug: "tymio",
        isStale: false,
        ageMinutes: 1
      },
      health: {
        status: "rebuilding",
        pendingRebuild: true,
        compiling: false,
        lastRebuildAt: null,
        lastErrorMessage: null
      }
    });
    renderHub();
    await waitFor(() => {
      expect(screen.getByText(/^Rebuilding$/i)).toBeInTheDocument();
    });
  });

  it("shows Error badge and truncated rebuild error message", async () => {
    mockGetAtlas.mockResolvedValue({
      atlas: baseAtlas,
      compiled: true,
      freshness: {
        materializedAt: baseAtlas.materializedAt,
        sourceMaxUpdatedAt: baseAtlas.sourceMaxUpdatedAt,
        workspaceSlug: "tymio",
        isStale: false,
        ageMinutes: 1
      },
      health: {
        status: "error",
        pendingRebuild: false,
        compiling: false,
        lastRebuildAt: null,
        lastErrorMessage: "EACCES write atlas"
      }
    });
    renderHub();
    await waitFor(() => {
      expect(screen.getByText(/^Error$/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/last rebuild failed: EACCES write atlas/i)).toBeInTheDocument();
  });
});
