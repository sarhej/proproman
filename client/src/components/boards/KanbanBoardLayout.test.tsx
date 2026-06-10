import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  KanbanBoardLayout,
  kanbanColumnClassName,
  minTrackWidthPx,
  mobileColumnWidthPx,
  KANBAN_MOBILE_COL_MAX_PX,
  useKanbanColumnClassName
} from "./KanbanBoardLayout";

function ColumnProbe() {
  const className = useKanbanColumnClassName();
  return <div data-testid="column-probe" className={className} />;
}

describe("KanbanBoardLayout", () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    class MockResizeObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 1200;
      }
    });
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return 1200;
      }
    });
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    vi.restoreAllMocks();
  });

  it("renders viewport and track wrappers", () => {
    const { container } = render(
      <KanbanBoardLayout columnCount={3}>
        <div data-testid="col">A</div>
      </KanbanBoardLayout>
    );
    expect(container.querySelector(".kanban-viewport")).toBeTruthy();
    expect(container.querySelector(".kanban-track")).toBeTruthy();
    expect(screen.getByTestId("col")).toBeInTheDocument();
  });

  it("uses distribution column classes when columns fit viewport", () => {
    render(
      <KanbanBoardLayout columnCount={3}>
        <ColumnProbe />
      </KanbanBoardLayout>
    );
    const probe = screen.getByTestId("column-probe");
    expect(probe.className).toContain("kanban-column--distribute");
    expect(probe.className).not.toContain("kanban-column--overflow");
  });

  it("uses full-width track in distribute mode (no w-max content blowout)", () => {
    const { container } = render(
      <KanbanBoardLayout columnCount={3}>
        <ColumnProbe />
      </KanbanBoardLayout>
    );
    const track = container.querySelector(".kanban-track");
    expect(track?.className).toContain("kanban-track--distribute");
    expect(track?.className).toContain("w-full");
    expect(track?.className).not.toContain("w-max");
  });

  it("shows scroll controls and overflow track when columns exceed viewport", () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 400;
      }
    });
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return 980;
      }
    });
    const { container } = render(
      <KanbanBoardLayout columnCount={4} columnSnapLabels={["A", "B", "C", "D"]}>
        <ColumnProbe />
      </KanbanBoardLayout>
    );
    const track = container.querySelector(".kanban-track");
    expect(track?.className).toContain("kanban-track--overflow");
    expect(track?.getAttribute("style")).toContain("min-width");
    expect(screen.getByRole("button", { name: /scroll columns left/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /scroll columns right/i })).toBeInTheDocument();
    expect(container.querySelector(".kanban-viewport")?.getAttribute("data-overflow")).toBe("true");
  });

  it("enables mobile snap mode below lg breakpoint", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    });
    render(
      <KanbanBoardLayout columnCount={3} columnSnapLabels={["Unassigned", "Backlog", "Done"]}>
        <ColumnProbe />
      </KanbanBoardLayout>
    );
    expect(screen.getByRole("tablist", { name: /board columns/i })).toBeInTheDocument();
    expect(screen.getByText(/press and hold a card/i)).toBeInTheDocument();
    expect(screen.getByTestId("column-probe").className).toContain("kanban-column--mobile-snap");
  });

  it("applies drag-active class to viewport when dragging on mobile", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    });
    const { container } = render(
      <KanbanBoardLayout columnCount={2} columnSnapLabels={["A", "B"]} dragActive>
        <ColumnProbe />
      </KanbanBoardLayout>
    );
    expect(container.querySelector(".kanban-viewport--drag-active")).toBeTruthy();
  });

  it("exports kanbanColumnClassName helper", () => {
    expect(kanbanColumnClassName(false)).toContain("kanban-column--distribute");
    expect(kanbanColumnClassName(true)).toContain("kanban-column--overflow");
  });

  it("switches to overflow columns when distribute layout still spills horizontally", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 1200;
      }
    });
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return 1210;
      }
    });
    render(
      <KanbanBoardLayout columnCount={3}>
        <ColumnProbe />
      </KanbanBoardLayout>
    );
    expect(screen.getByTestId("column-probe").className).toContain("kanban-column--overflow");
  });

  it("adds inline-end padding on track for last-column scroll clearance", () => {
    const { container } = render(
      <KanbanBoardLayout columnCount={3}>
        <ColumnProbe />
      </KanbanBoardLayout>
    );
    const track = container.querySelector(".kanban-track");
    expect(track?.className).toContain("kanban-track");
    expect(getComputedStyle(track!).paddingInlineEnd).not.toBe("0px");
  });

  it("mobileColumnWidthPx mirrors CSS min(100%, 340px)", () => {
    expect(mobileColumnWidthPx(280)).toBe(280);
    expect(mobileColumnWidthPx(390)).toBe(KANBAN_MOBILE_COL_MAX_PX);
    expect(mobileColumnWidthPx(340)).toBe(340);
  });

  it("minTrackWidthPx uses viewport-based mobile column width plus trailing gap", () => {
    const viewport = 300;
    const col = mobileColumnWidthPx(viewport);
    expect(minTrackWidthPx(3, true, viewport)).toBe(3 * col + 2 * 12 + 12);
    expect(minTrackWidthPx(3, true, 400)).toBe(3 * KANBAN_MOBILE_COL_MAX_PX + 2 * 12 + 12);
  });

  it("minTrackWidthPx desktop overflow includes trailing gap", () => {
    expect(minTrackWidthPx(4, false)).toBe(4 * 220 + 3 * 12 + 12);
  });
});
