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
