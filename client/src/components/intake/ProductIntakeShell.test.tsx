import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { ProductIntakeShell } from "./ProductIntakeShell";
import { api } from "../../lib/api";
import type { CreationPlan, IntakeSession } from "../../types/models";

vi.mock("../../lib/api", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...mod,
    api: {
      ...mod.api,
      createIntakeSession: vi.fn(),
      updateIntakeSession: vi.fn(),
      analyzeIntakeSession: vi.fn(),
      clarifyIntakeSession: vi.fn(),
      updateIntakePlan: vi.fn(),
      generateIntakeDrafts: vi.fn(),
      updateIntakeDraft: vi.fn(),
      commitIntakeSession: vi.fn(),
      getInitiatives: vi.fn().mockResolvedValue({ initiatives: [] }),
      getAttachmentLinks: vi.fn().mockResolvedValue({ links: [] }),
      uploadAttachment: vi.fn()
    }
  };
});

vi.mock("../attachments/AttachmentPanel", () => ({
  AttachmentPanel: ({ target }: { target: { intakeSessionId?: string | null } }) => (
    <div data-testid="attachment-panel">{target.intakeSessionId}</div>
  )
}));

const mockCreate = api.createIntakeSession as ReturnType<typeof vi.fn>;
const mockUpdate = api.updateIntakeSession as ReturnType<typeof vi.fn>;
const mockAnalyze = api.analyzeIntakeSession as ReturnType<typeof vi.fn>;
const mockClarify = api.clarifyIntakeSession as ReturnType<typeof vi.fn>;
const mockUpdatePlan = api.updateIntakePlan as ReturnType<typeof vi.fn>;
const mockGenerateDrafts = api.generateIntakeDrafts as ReturnType<typeof vi.fn>;
const mockUpdateDraft = api.updateIntakeDraft as ReturnType<typeof vi.fn>;
const mockCommit = api.commitIntakeSession as ReturnType<typeof vi.fn>;
const mockGetInitiatives = api.getInitiatives as ReturnType<typeof vi.fn>;

function samplePlan(overrides?: Partial<CreationPlan>): CreationPlan {
  return {
    planType: "SINGLE_BUG_FEATURE",
    rationale: "Bug maps to Feature storyType BUG",
    confidence: 0.7,
    needsClarification: false,
    items: [
      {
        key: "bug-1",
        hubEntityType: "Feature",
        title: "Login clipped on rotate",
        storyType: "BUG",
        parentKey: null
      }
    ],
    ...overrides
  };
}

function session(overrides?: Partial<IntakeSession>): IntakeSession {
  return {
    id: "s1",
    productId: "p1",
    mode: "BUG",
    status: "CAPTURING",
    rawText: "",
    createdAt: "2026-09-07T12:00:00.000Z",
    updatedAt: "2026-09-07T12:00:00.000Z",
    ...overrides
  };
}

describe("ProductIntakeShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockCreate.mockResolvedValue({ session: session() });
    mockUpdate.mockResolvedValue({ session: session({ rawText: "hi" }) });
    mockAnalyze.mockResolvedValue({
      session: session({ status: "PLAN_READY", rawText: "hi", creationPlan: samplePlan() }),
      analyze: {
        stub: false,
        source: "heuristic",
        needsClarification: false,
        creationPlan: samplePlan(),
        confidence: 0.7,
        message: "Creation plan ready (heuristic). Review items, then continue."
      }
    });
    mockUpdatePlan.mockImplementation(async (_id: string, creationPlan: CreationPlan) => ({
      session: session({ status: "PLAN_READY", creationPlan })
    }));
    mockGetInitiatives.mockResolvedValue({
      initiatives: [
        {
          id: "init-1",
          title: "Product roadmap",
          productId: "p1",
          domainId: "d1",
          domain: { id: "d1", name: "Platform", color: "#000", sortOrder: 0 },
          priority: "P2",
          horizon: "NOW",
          status: "IN_PROGRESS",
          commercialType: "CARE_QUALITY",
          isGap: false,
          isEpic: true,
          sortOrder: 0,
          personaImpacts: [],
          revenueWeights: [],
          features: [],
          decisions: [],
          risks: [],
          demandLinks: [],
          assignments: [],
          milestones: [],
          kpis: [],
          stakeholders: []
        }
      ]
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates BUG session on open and shows attachment panel", async () => {
    const onClose = vi.fn();
    render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={onClose}
      />
    );

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ productId: "p1", mode: "BUG" }));
    expect(screen.getByText(/Create Bug/i)).toBeInTheDocument();
    expect(screen.getByTestId("attachment-panel")).toHaveTextContent("s1");
  });

  it("creates FEATURE session with feature chrome", async () => {
    mockCreate.mockResolvedValue({ session: session({ mode: "FEATURE" }) });
    render(
      <ProductIntakeShell
        open={{ mode: "FEATURE", productId: "p1", productName: "App" }}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ productId: "p1", mode: "FEATURE" }));
    expect(screen.getByText(/Create Feature/i)).toBeInTheDocument();
  });

  it("shows create failure without hanging forever", async () => {
    mockCreate.mockRejectedValueOnce(new Error("boom"));
    render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /analyze/i })).toBeDisabled();
  });

  it("debounces autosave of rawText", async () => {
    render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    const area = screen.getByPlaceholderText(/Paste text/i);
    fireEvent.change(area, { target: { value: "first" } });
    fireEvent.change(area, { target: { value: "second" } });
    expect(mockUpdate).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith("s1", expect.objectContaining({ rawText: "second" }))
    );
  });

  it("Analyze shows creation plan review", async () => {
    render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(/Paste text/i), {
      target: { value: "bug text that is long enough to analyze cleanly" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
    await waitFor(() => expect(mockAnalyze).toHaveBeenCalledWith("s1"));
    expect(await screen.findByDisplayValue("Login clipped on rotate")).toBeInTheDocument();
    expect(screen.getByText(/SINGLE_BUG_FEATURE/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate drafts/i })).toBeEnabled();
  });

  it("Generate drafts loads bug draft editor", async () => {
    const drafts = {
      source: "heuristic" as const,
      items: [
        {
          key: "bug-1",
          hubEntityType: "Feature" as const,
          storyType: "BUG" as const,
          approval: "pending" as const,
          fieldProvenance: { severity: "ai" as const, priority: "ai" as const },
          title: "Login clipped on rotate",
          description: "CTA clipped",
          stepsToReproduce: ["Open login", "Rotate"],
          expected: "Visible",
          actual: "Clipped",
          environment: "iOS",
          severity: "HIGH" as const,
          priority: "P1" as const,
          acceptanceCriteria: [],
          affectedArea: "",
          requirements: []
        }
      ]
    };
    mockGenerateDrafts.mockResolvedValueOnce({
      session: session({ status: "REVIEWING", creationPlan: samplePlan(), drafts }),
      drafts,
      source: "heuristic",
      message: "Bug drafts ready (heuristic)."
    });
    mockUpdateDraft.mockImplementation(async (_id: string, _key: string, patch: Record<string, unknown>) => {
      const next = { ...drafts.items[0]!, ...patch };
      const nextDrafts = { ...drafts, items: [next] };
      return { session: session({ status: "REVIEWING", drafts: nextDrafts }), draft: next, drafts: nextDrafts };
    });

    render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
    await waitFor(() => expect(mockAnalyze).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /generate drafts/i }));
    await waitFor(() => expect(mockGenerateDrafts).toHaveBeenCalledWith("s1"));
    expect(await screen.findByDisplayValue("CTA clipped")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Severity$/i)).toHaveValue("HIGH");
    fireEvent.change(screen.getByLabelText(/^Severity$/i), { target: { value: "LOW" } });
    await waitFor(() =>
      expect(mockUpdateDraft).toHaveBeenCalledWith("s1", "bug-1", expect.objectContaining({ severity: "LOW" }))
    );
  });

  it("FEATURE mode Generate drafts loads feature draft editor", async () => {
    mockCreate.mockResolvedValue({ session: session({ mode: "FEATURE" }) });
    const featurePlan = samplePlan({
      planType: "SINGLE_FEATURE",
      items: [
        {
          key: "feat-1",
          hubEntityType: "Feature",
          title: "Better filters",
          storyType: "FUNCTIONAL"
        }
      ]
    });
    mockAnalyze.mockResolvedValueOnce({
      session: session({ mode: "FEATURE", status: "PLAN_READY", creationPlan: featurePlan }),
      analyze: {
        stub: false,
        source: "heuristic",
        needsClarification: false,
        creationPlan: featurePlan,
        confidence: 0.7,
        message: "plan ready"
      }
    });
    const drafts = {
      source: "heuristic" as const,
      items: [
        {
          key: "feat-1",
          hubEntityType: "Feature" as const,
          storyType: "FUNCTIONAL" as const,
          approval: "pending" as const,
          fieldProvenance: { priority: "ai" as const },
          title: "Better filters",
          problem: "Users cannot narrow results",
          solution: "Add facet filters",
          personas: ["PM"],
          businessValue: "Faster findability",
          priority: "DISCOVERY" as const,
          priorityRationale: "Needs research",
          missingInputs: ["Success metrics"],
          acceptanceCriteria: ["Filters apply"],
          dependencies: [],
          risks: [],
          openQuestions: [],
          requirements: []
        }
      ]
    };
    mockGenerateDrafts.mockResolvedValueOnce({
      session: session({
        mode: "FEATURE",
        status: "REVIEWING",
        creationPlan: featurePlan,
        drafts
      }),
      drafts,
      source: "heuristic",
      message: "Feature drafts ready (heuristic)."
    });
    mockUpdateDraft.mockImplementation(async (_id: string, _key: string, patch: Record<string, unknown>) => {
      const next = { ...drafts.items[0]!, ...patch };
      const nextDrafts = { ...drafts, items: [next] };
      return {
        session: session({ mode: "FEATURE", status: "REVIEWING", drafts: nextDrafts }),
        draft: next,
        drafts: nextDrafts
      };
    });

    render(
      <ProductIntakeShell
        open={{ mode: "FEATURE", productId: "p1", productName: "App" }}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
    await waitFor(() => expect(mockAnalyze).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /generate drafts/i }));
    await waitFor(() => expect(mockGenerateDrafts).toHaveBeenCalledWith("s1"));
    expect(await screen.findByDisplayValue("Users cannot narrow results")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Priority$/i)).toHaveValue("DISCOVERY");
    expect(screen.getByLabelText(/^Problem$/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Problem$/i), {
      target: { value: "Updated problem statement" }
    });
    fireEvent.blur(screen.getByLabelText(/^Problem$/i));
    await waitFor(() =>
      expect(mockUpdateDraft).toHaveBeenCalledWith(
        "s1",
        "feat-1",
        expect.objectContaining({ problem: "Updated problem statement" })
      )
    );
  });

  it("bug draft field blur saves via updateIntakeDraft", async () => {
    const drafts = {
      source: "heuristic" as const,
      items: [
        {
          key: "bug-1",
          hubEntityType: "Feature" as const,
          storyType: "BUG" as const,
          approval: "pending" as const,
          fieldProvenance: { title: "ai" as const },
          title: "Old title",
          description: "Old desc",
          stepsToReproduce: ["a"],
          expected: "e1",
          actual: "a1",
          environment: "env1",
          severity: "MEDIUM" as const,
          priority: "P2" as const,
          acceptanceCriteria: [],
          affectedArea: "",
          requirements: []
        }
      ]
    };
    mockGenerateDrafts.mockResolvedValueOnce({
      session: session({ status: "REVIEWING", creationPlan: samplePlan(), drafts }),
      drafts,
      source: "heuristic",
      message: "ready"
    });
    mockUpdateDraft.mockResolvedValue({
      session: session({ status: "REVIEWING", drafts }),
      draft: drafts.items[0],
      drafts
    });

    render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
    await waitFor(() => expect(mockAnalyze).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /generate drafts/i }));
    expect(await screen.findByDisplayValue("Old desc")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Description$/i), { target: { value: "New desc" } });
    fireEvent.blur(screen.getByLabelText(/^Description$/i));
    await waitFor(() =>
      expect(mockUpdateDraft).toHaveBeenCalledWith(
        "s1",
        "bug-1",
        expect.objectContaining({ description: "New desc" })
      )
    );

    fireEvent.change(screen.getByLabelText(/^Expected$/i), { target: { value: "new expected" } });
    fireEvent.blur(screen.getByLabelText(/^Expected$/i));
    await waitFor(() =>
      expect(mockUpdateDraft).toHaveBeenCalledWith(
        "s1",
        "bug-1",
        expect.objectContaining({ expected: "new expected" })
      )
    );

    fireEvent.change(screen.getByLabelText(/^Steps to reproduce$/i), {
      target: { value: "one\ntwo" }
    });
    fireEvent.blur(screen.getByLabelText(/^Steps to reproduce$/i));
    await waitFor(() =>
      expect(mockUpdateDraft).toHaveBeenCalledWith(
        "s1",
        "bug-1",
        expect.objectContaining({ stepsToReproduce: ["one", "two"] })
      )
    );
  });

  it("Analyze clarification path shows questions", async () => {
    const clarifyPlan = samplePlan({
      needsClarification: true,
      confidence: 0.4,
      clarificationQuestions: [{ id: "severity", prompt: "How severe is the impact?", choices: ["HIGH", "LOW"] }]
    });
    mockAnalyze.mockResolvedValueOnce({
      session: session({ status: "CLARIFYING", creationPlan: clarifyPlan }),
      analyze: {
        stub: false,
        source: "heuristic",
        needsClarification: true,
        creationPlan: clarifyPlan,
        confidence: 0.4,
        message: "Need a bit more context before locking the creation plan."
      }
    });
    mockClarify.mockResolvedValueOnce({
      session: session({ status: "PLAN_READY", creationPlan: samplePlan() }),
      analyze: {
        stub: false,
        source: "heuristic",
        needsClarification: false,
        creationPlan: samplePlan(),
        confidence: 0.72,
        message: "Clarification applied. Review the creation plan."
      }
    });

    render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
    expect(await screen.findByText(/How severe is the impact/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/How severe is the impact/i), { target: { value: "HIGH" } });
    fireEvent.click(screen.getByRole("button", { name: /submit answers/i }));
    await waitFor(() => expect(mockClarify).toHaveBeenCalledWith("s1", { severity: "HIGH" }));
    expect(await screen.findByDisplayValue("Login clipped on rotate")).toBeInTheDocument();
  });

  it("plan remove persists via updateIntakePlan", async () => {
    const twoItemPlan = samplePlan({
      planType: "MULTI_ITEMS",
      items: [
        { key: "bug-1", hubEntityType: "Feature", title: "A", storyType: "BUG" },
        { key: "bug-2", hubEntityType: "Feature", title: "B", storyType: "BUG" }
      ]
    });
    mockAnalyze.mockResolvedValueOnce({
      session: session({ status: "PLAN_READY", creationPlan: twoItemPlan }),
      analyze: {
        stub: false,
        source: "heuristic",
        needsClarification: false,
        creationPlan: twoItemPlan,
        confidence: 0.7,
        message: "ready"
      }
    });

    render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
    expect(await screen.findByDisplayValue("A")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /^remove$/i })[0]!);
    await waitFor(() =>
      expect(mockUpdatePlan).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({
          items: [expect.objectContaining({ key: "bug-2", title: "B" })]
        })
      )
    );
  });

  it("Analyze failure still opens manual fallback", async () => {
    mockAnalyze.mockRejectedValueOnce(new Error("llm down"));
    render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
    expect(await screen.findByText("llm down")).toBeInTheDocument();
    expect(screen.getByText(/Manual structured form/i)).toBeInTheDocument();
  });

  it("Cancel abandons session then closes", async () => {
    const onClose = vi.fn();
    render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={onClose}
      />
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole("button", { name: /cancel/i })[0]!);
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith("s1", { status: "ABANDONED" })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape abandons and closes", async () => {
    const onClose = vi.fn();
    render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={onClose}
      />
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith("s1", { status: "ABANDONED" })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("Approve for create enables Create in hub and commits", async () => {
    const drafts = {
      source: "heuristic" as const,
      items: [
        {
          key: "bug-1",
          hubEntityType: "Feature" as const,
          storyType: "BUG" as const,
          approval: "pending" as const,
          fieldProvenance: {},
          title: "Login clipped on rotate",
          description: "CTA clipped",
          stepsToReproduce: ["Open login"],
          expected: "Visible",
          actual: "Clipped",
          environment: "iOS",
          severity: "HIGH" as const,
          priority: "P1" as const,
          acceptanceCriteria: ["CTA visible"],
          affectedArea: "",
          requirements: []
        }
      ]
    };
    mockGenerateDrafts.mockResolvedValueOnce({
      session: session({ status: "REVIEWING", creationPlan: samplePlan(), drafts }),
      drafts,
      source: "heuristic",
      message: "ready"
    });
    mockUpdateDraft.mockImplementation(async (_id: string, _key: string, patch: Record<string, unknown>) => {
      const next = { ...drafts.items[0]!, ...patch };
      const nextDrafts = { ...drafts, items: [next] };
      return {
        session: session({ status: "REVIEWING", drafts: nextDrafts }),
        draft: next,
        drafts: nextDrafts
      };
    });
    mockCommit.mockResolvedValueOnce({
      session: session({ status: "COMMITTED", drafts }),
      created: {
        initiatives: [],
        features: [{ draftKey: "bug-1", id: "f1", title: "Login clipped on rotate", storyType: "BUG" }],
        requirements: [{ draftKey: "bug-1-ac-1", id: "r1", title: "CTA visible", featureId: "f1" }]
      },
      message: "Created 1 Feature(s) in the hub."
    });

    render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
    await waitFor(() => expect(mockAnalyze).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /generate drafts/i }));
    expect(await screen.findByText("Needs review", { exact: true })).toBeInTheDocument();

    const createBtn = screen.getByRole("button", { name: /Create in hub/i });
    expect(createBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Approve for create/i }));
    await waitFor(() => expect(mockUpdateDraft).toHaveBeenCalledWith("s1", "bug-1", { approval: "approved" }));
    await waitFor(() => expect(createBtn).toBeEnabled());

    fireEvent.click(createBtn);
    await waitFor(() =>
      expect(mockCommit).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ initiativeId: "init-1" })
      )
    );
    expect(await screen.findByText("Created in hub", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Login clipped on rotate/i)).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<ProductIntakeShell open={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("ignores stale create when closed quickly", async () => {
    let resolveCreate: (v: unknown) => void = () => undefined;
    mockCreate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );
    const { rerender } = render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={vi.fn()}
      />
    );
    expect(mockCreate).toHaveBeenCalled();
    rerender(<ProductIntakeShell open={null} onClose={vi.fn()} />);
    await act(async () => {
      resolveCreate({ session: session({ id: "late" }) });
    });
    expect(screen.queryByTestId("attachment-panel")).not.toBeInTheDocument();
  });
});
