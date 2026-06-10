import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

const KANBAN_COL_MIN_PX = 220;
const KANBAN_COL_GAP_PX = 12;
/** Matches CSS `--kanban-mobile-col-width: min(100%, 340px)` cap. */
export const KANBAN_MOBILE_COL_MAX_PX = 340;
const MOBILE_KANBAN_MQ = "(max-width: 1023px)";

/** Column width on mobile snap — mirrors `min(100%, 340px)` from CSS. */
export function mobileColumnWidthPx(viewportWidthPx: number): number {
  return Math.min(Math.max(viewportWidthPx, 0), KANBAN_MOBILE_COL_MAX_PX);
}

type KanbanLayoutContextValue = {
  columnClassName: string;
  overflowMode: boolean;
  mobileSnap: boolean;
};

const KanbanLayoutContext = createContext<KanbanLayoutContextValue>({
  columnClassName: "kanban-column kanban-column--distribute",
  overflowMode: false,
  mobileSnap: false
});

export function kanbanColumnClassName(overflowMode: boolean, mobileSnap = false): string {
  if (mobileSnap) return "kanban-column kanban-column--mobile-snap";
  return overflowMode
    ? "kanban-column kanban-column--overflow"
    : "kanban-column kanban-column--distribute";
}

export function minTrackWidthPx(
  columnCount: number,
  mobileSnap = false,
  viewportWidthPx?: number
): number {
  if (columnCount <= 0) return 0;
  const gaps = Math.max(columnCount - 1, 0) * KANBAN_COL_GAP_PX;
  const trailingPad = KANBAN_COL_GAP_PX;
  if (mobileSnap) {
    const mobileCol = mobileColumnWidthPx(viewportWidthPx ?? KANBAN_MOBILE_COL_MAX_PX);
    return columnCount * mobileCol + gaps + trailingPad;
  }
  return columnCount * KANBAN_COL_MIN_PX + gaps + trailingPad;
}

export function useMobileKanbanSnap(): boolean {
  const [mobileSnap, setMobileSnap] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_KANBAN_MQ).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_KANBAN_MQ);
    const onChange = () => setMobileSnap(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mobileSnap;
}

type Props = {
  columnCount: number;
  children: ReactNode;
  className?: string;
  /** Labels for mobile column tabs / swipe navigation (one per column). */
  columnSnapLabels?: string[];
  /** True while a card is being dragged (locks mobile viewport scroll + edge auto-scroll). */
  dragActive?: boolean;
  /** Pointer X during drag for edge auto-scroll (viewport coordinates). */
  dragPointerX?: number | null;
};

const EDGE_SCROLL_ZONE_PX = 56;
const EDGE_SCROLL_MAX_SPEED = 12;

export function KanbanBoardLayout({
  columnCount,
  children,
  className,
  columnSnapLabels,
  dragActive = false,
  dragPointerX = null
}: Props) {
  const { t } = useTranslation();
  const mobileSnap = useMobileKanbanSnap();
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragPointerXRef = useRef<number | null>(dragPointerX);
  const [overflowMode, setOverflowMode] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);

  const syncScrollState = useCallback((el: HTMLDivElement) => {
    const canScroll = el.scrollWidth > el.clientWidth + 1;
    setScrollable(canScroll);
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);

  const updateLayout = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const viewportWidth = el.clientWidth;
    const minWidth = minTrackWidthPx(columnCount, mobileSnap, viewportWidth);
    const needsOverflowByCount = mobileSnap || minWidth > viewportWidth;
    setOverflowMode(needsOverflowByCount);
    syncScrollState(el);
    // If distribute columns still spill past the scrollport, switch to fixed-width overflow columns.
    if (!needsOverflowByCount && el.scrollWidth > el.clientWidth + 1) {
      setOverflowMode(true);
      syncScrollState(el);
    }
  }, [columnCount, mobileSnap, syncScrollState]);

  useEffect(() => {
    updateLayout();
    const el = viewportRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => updateLayout());
    ro.observe(el);

    const onScroll = () => syncScrollState(el);
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [updateLayout, syncScrollState]);

  useEffect(() => {
    dragPointerXRef.current = dragPointerX;
  }, [dragPointerX]);

  useEffect(() => {
    if (!dragActive || !mobileSnap) return;
    const el = viewportRef.current;
    if (!el) return;

    let raf = 0;
    const tick = () => {
      const x = dragPointerXRef.current;
      if (x != null) {
        const rect = el.getBoundingClientRect();
        const distLeft = x - rect.left;
        const distRight = rect.right - x;
        if (distLeft < EDGE_SCROLL_ZONE_PX && distLeft >= 0) {
          const factor = 1 - distLeft / EDGE_SCROLL_ZONE_PX;
          el.scrollLeft -= Math.ceil(EDGE_SCROLL_MAX_SPEED * factor);
        } else if (distRight < EDGE_SCROLL_ZONE_PX && distRight >= 0) {
          const factor = 1 - distRight / EDGE_SCROLL_ZONE_PX;
          el.scrollLeft += Math.ceil(EDGE_SCROLL_MAX_SPEED * factor);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dragActive, mobileSnap]);

  useEffect(() => {
    if (!mobileSnap || !viewportRef.current) return;
    const root = viewportRef.current;
    const columns = root.querySelectorAll<HTMLElement>(".kanban-column");
    if (columns.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestIndex = -1;
        let bestRatio = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Array.from(columns).indexOf(entry.target as HTMLElement);
          if (idx >= 0 && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestIndex = idx;
          }
        }
        if (bestIndex >= 0) setActiveColumnIndex(bestIndex);
      },
      { root, threshold: [0.35, 0.5, 0.65, 0.85] }
    );

  columns.forEach((col) => observer.observe(col));
  return () => observer.disconnect();
}, [mobileSnap, columnCount, children]);

  const columnClassName = kanbanColumnClassName(overflowMode, mobileSnap);
  const showFade = scrollable && !atEnd && !mobileSnap;
  const trackMinWidth = overflowMode
    ? minTrackWidthPx(columnCount, mobileSnap, viewportRef.current?.clientWidth)
    : undefined;
  const snapLabels =
    columnSnapLabels && columnSnapLabels.length === columnCount
      ? columnSnapLabels
      : Array.from({ length: columnCount }, (_, i) => `${i + 1}`);

  const scrollByPage = (direction: -1 | 1) => {
    const el = viewportRef.current;
    if (!el) return;
    const delta = Math.max(el.clientWidth * 0.75, KANBAN_COL_MIN_PX);
    el.scrollBy({ left: direction * delta, behavior: "smooth" });
  };

  const scrollToColumn = (index: number) => {
    const root = viewportRef.current;
    if (!root) return;
    const columns = root.querySelectorAll<HTMLElement>(".kanban-column");
    const col = columns[index];
    if (!col) return;
    col.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    setActiveColumnIndex(index);
  };

  return (
    <KanbanLayoutContext.Provider value={{ columnClassName, overflowMode, mobileSnap }}>
      <div className={["kanban-board-shell relative min-w-0 max-w-full", className ?? ""].filter(Boolean).join(" ")}>
        {mobileSnap ? (
          <div
            className="mb-2 flex gap-1 overflow-x-auto pb-1 lg:hidden"
            role="tablist"
            aria-label={t("executionBoard.mobileColumnNav")}
          >
            {snapLabels.map((label, index) => (
              <button
                key={`${label}-${index}`}
                type="button"
                role="tab"
                aria-selected={activeColumnIndex === index}
                onClick={() => scrollToColumn(index)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  activeColumnIndex === index
                    ? "border-sky-300 bg-sky-100 text-sky-900"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {scrollable && !mobileSnap ? (
          <div className="mb-1 hidden items-center justify-end gap-1 lg:flex">
            <button
              type="button"
              onClick={() => scrollByPage(-1)}
              disabled={atStart}
              aria-label={t("executionBoard.scrollColumnsLeft")}
              className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => scrollByPage(1)}
              disabled={atEnd}
              aria-label={t("executionBoard.scrollColumnsRight")}
              className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : null}
        <div
          ref={viewportRef}
          className={[
            "kanban-viewport relative overflow-x-auto pb-2",
            mobileSnap ? "kanban-viewport--mobile-snap" : "",
            dragActive && mobileSnap ? "kanban-viewport--drag-active" : "",
            scrollable ? "kanban-viewport--scrollable" : "",
            showFade ? "kanban-viewport--fade-right" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          data-overflow={overflowMode ? "true" : "false"}
          data-mobile-snap={mobileSnap ? "true" : "false"}
        >
          <div
            className={[
              "kanban-track flex min-h-0 gap-3",
              overflowMode ? "kanban-track--overflow w-max min-w-full" : "kanban-track--distribute w-full"
            ].join(" ")}
            style={trackMinWidth ? { minWidth: trackMinWidth } : undefined}
          >
            {children}
          </div>
          {showFade ? <div className="kanban-scroll-fade pointer-events-none" aria-hidden /> : null}
        </div>
        {mobileSnap ? (
          <p className="mt-1 text-center text-[10px] text-slate-400 lg:hidden">
            {t("executionBoard.mobileSwipeHint")}
          </p>
        ) : null}
      </div>
    </KanbanLayoutContext.Provider>
  );
}

export function useKanbanColumnClassName(): string {
  return useContext(KanbanLayoutContext).columnClassName;
}

export function useKanbanLayout(): KanbanLayoutContextValue {
  return useContext(KanbanLayoutContext);
}
