import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { ProductIntakeShell } from "./ProductIntakeShell";
import { api } from "../../lib/api";
import type { IntakeSession } from "../../types/models";

vi.mock("../../lib/api", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...mod,
    api: {
      ...mod.api,
      createIntakeSession: vi.fn(),
      updateIntakeSession: vi.fn(),
      analyzeIntakeSession: vi.fn(),
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
      session: session({ rawText: "hi" }),
      analyze: {
        stub: true,
        needsClarification: false,
        creationPlan: null,
        confidence: null,
        message: "Analyze stub: planner not enabled yet."
      }
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

  it("Analyze shows stub message and manual fallback", async () => {
    render(
      <ProductIntakeShell
        open={{ mode: "BUG", productId: "p1", productName: "App" }}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(/Paste text/i), {
      target: { value: "bug text" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^analyze$/i }));
    await waitFor(() => expect(mockAnalyze).toHaveBeenCalledWith("s1"));
    expect(await screen.findByText(/Analyze stub/i)).toBeInTheDocument();
    expect(screen.getByText(/Manual structured form/i)).toBeInTheDocument();
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
