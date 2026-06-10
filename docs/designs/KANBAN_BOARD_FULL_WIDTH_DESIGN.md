# Execution Board / Kanban Full-Width Layout Design

**Status:** Design proposal (no implementation)  
**Scope:** Product Execution Board (`ExecutionBoardPage`) and shared shell/sidebar behavior that affects all Kanban views  
**Related wireframes:** [`KANBAN_BOARD_FULL_WIDTH_WIREFRAMES.svg`](./KANBAN_BOARD_FULL_WIDTH_WIREFRAMES.svg)

---

## Problem summary

The Execution Board is constrained by three stacked layout layers:

1. **AppShell** caps content at `max-w-[1600px]`, centers it, and reserves a fixed **240px** sidebar with no desktop collapse.
2. **ExecutionBoardPage** adds another `p-4` inside `<main>`, further shrinking the board area.
3. **Kanban columns** use a hard **`w-[200px] shrink-0`**, so columns never grow to fill space; leftover width appears as gutters beside the scroll row.

Requirements Kanban already uses `flex-1` columns (better distribution pattern). Execution Board does not.

---

## Layout architecture

### Shell zones

```
┌─────────────────────────────────────────────────────────────┐
│ Header (sticky, full viewport width)                        │
├──────────┬──────────────────────────────────────────────────┤
│ Sidebar  │ Main content area                                │
│ (collap- │  ┌─ Board chrome (header, filters) ────────────┐ │
│  sible)  │  └─ Kanban scroll viewport (full remaining w) ─┘ │
└──────────┴──────────────────────────────────────────────────┘
```

### Full-width board area

| Layer | Current | Proposed |
|-------|---------|----------|
| Shell grid | `max-w-[1600px] mx-auto` | Remove max-width cap for board routes **or** introduce a `layoutMode="fluid"` prop on AppShell used by Kanban/Explorer views |
| Shell padding | `p-4 lg:p-6` on grid | Keep shell padding; board scroll region uses **negative margin or `w-full` breakout** only where needed, or reduce inner page padding on board routes |
| Sidebar | Fixed `240px`, always open on `lg+` | Collapsible: **expanded 240px** / **collapsed 56px** (icon rail) |
| Main | `1fr` column | `min-w-0` on `<main>` so flex children can shrink and scroll horizontally |

**Reference patterns in codebase:**

- `ideMode` in AppShell already removes sidebar + header for embedded views — proves shell can be fluid.
- `RequirementsKanban` `flex gap-4` + column `flex-1` — distribution model to reuse.
- Product Explorer uses full main width without extra max-width (only shell constraint).

### Collapsible sidebar behavior

| State | Width | Content |
|-------|-------|---------|
| Expanded (default) | 240px | Section labels + icon + text nav items (current) |
| Collapsed | 56px | Icons only; tooltips on hover/focus; section labels hidden |
| Mobile (`< lg`) | Unchanged | Right drawer overlay (existing) |

**Toggle placement:** Chevron button on sidebar top edge (inside aside), visible on `lg+`. Icon: `PanelLeftClose` / `PanelLeftOpen` (lucide).

**Persistence:** `localStorage` key `nav.sidebarCollapsed` (`"true"` / `"false"`). Same pattern as Product Explorer terminology preference.

**Keyboard:** Toggle via `Ctrl/Cmd + B` (optional, document in tooltip). Focus trap not needed — sidebar stays in tab order.

**Accessibility:** Toggle is `<button aria-expanded={!collapsed} aria-controls="app-sidebar">`. Collapsed nav links retain `aria-label={t(item.labelKey)}`.

---

## Column sizing algorithm

Apply to **Execution Board** first; optionally unify other Kanbans later.

### CSS structure

```html
<div class="kanban-viewport overflow-x-auto">          <!-- horizontal scroll container -->
  <div class="kanban-track flex gap-3 min-h-[...]"       <!-- flex row; width = max(content, 100%) -->
       style="width: max(100%, fit-content)">            <!-- or min-width: 100% on track -->
    <column class="kanban-column flex-1 min-w-[var(--kanban-col-min)] max-w-[var(--kanban-col-max)]" />
  </div>
</div>
```

### Token values (desktop)

| Token | Value | Rationale |
|-------|-------|-----------|
| `--kanban-col-min` | `220px` | Readable card width; slightly above current 200px |
| `--kanban-col-max` | `420px` | Prevents absurdly wide columns on ultrawide with 3 columns |
| `--kanban-col-gap` | `12px` | Matches current `gap-3` |

### Sizing rules

1. **Content floor:** Column width ≥ `max(--kanban-col-min, widest card intrinsic width)`. Cards use `w-full`; long titles wrap (2–3 lines) rather than expanding column unbounded.
2. **Distribution (few columns):** When `sum(min widths) + gaps < viewport`, each column gets `flex: 1 1 0` with `max-width: var(--kanban-col-max)` — equal share of leftover space.
3. **Overflow (many columns):** When `sum(min widths) + gaps > viewport`, track grows to content width; viewport scrolls horizontally. Columns keep `flex: 0 0 auto` with width = computed column width (no squish).
4. **Unassigned column:** Same rules; may warrant `--kanban-col-min: 260px` when count badge > 20 (optional visual emphasis — defer to implementation).

### Sticky column headers (optional v1.1)

If column body scrolls vertically (future: fixed viewport height), pin header row with `position: sticky; top: 0` inside each column. **v1:** page scrolls vertically as today; headers scroll with page.

---

## Horizontal scroll behavior

| Aspect | Decision |
|--------|----------|
| Scroll container | Single `.kanban-viewport` wrapping the column track — **not** the whole page |
| Scroll affordance | Fade gradient on right edge when `scrollWidth > clientWidth`; hide when at end |
| Scroll shadow | `box-shadow: inset -8px 0 8px -8px rgba(0,0,0,.08)` on viewport when scrollable |
| Wheel | Default horizontal scroll on trackpad; Shift+wheel maps to horizontal (browser default) |
| Drag-and-drop | dnd-kit collision detection unchanged; ensure drag overlay not clipped (`overflow: visible` on viewport during drag — or use existing `DragOverlay` portal) |
| URL / state | No column scroll position persistence in v1 |

---

## Responsive breakpoints

| Breakpoint | Behavior |
|------------|----------|
| `< lg` (639–1023) | Sidebar drawer only; board full width of main; columns stack or single-column scroll (keep current mobile: vertical stack **or** horizontal scroll — prefer **horizontal scroll** for parity with desktop DnD) |
| `lg+` | Collapsible sidebar + full-width main |
| `≥ 1600px` | No artificial 1600px cap on fluid layout routes |
| Mobile | Collapse toggle hidden; hamburger drawer unchanged |

---

## Interaction summary

| Interaction | Behavior |
|-------------|----------|
| Sidebar collapse | Reclaim ~184px horizontal space (240 → 56) |
| Column resize | Automatic via flex algorithm; no manual resize handles in v1 |
| Board header | Stays above scroll viewport; does not scroll horizontally |
| Selected / open card | Link navigation to requirement detail (unchanged); optional future: highlight card via `?highlight=` query |

---

## Edge cases

| Case | Handling |
|------|----------|
| **27+ cards in Unassigned** | Column grows vertically (page scroll); horizontal width follows distribution rules; show count badge; consider virtualized list in future — out of scope v1 |
| **Very wide cards** | `word-break: break-word`; `max-w` on column caps width; external refs truncate with ellipsis + title tooltip |
| **Empty columns** | `min-h-[160px]` drop target preserved; muted empty state text optional |
| **1 column board** | Single column expands to `min(100%, --kanban-col-max)` centered or left-aligned — **left-aligned** to match LTR reading |
| **10+ columns** | Horizontal scroll; first/last column partially visible as scroll hint |
| **readOnly mode** | Layout identical; DnD disabled (unchanged) |
| **ideMode** | Already full width; column algorithm still applies |

---

## Files with current constraints (reference)

| File | Lines | Constraint |
|------|-------|------------|
| `client/src/components/layout/AppShell.tsx` | 537–557 | `max-w-[1600px]`, `lg:grid-cols-[240px_1fr]`, fixed sidebar |
| `client/src/pages/ExecutionBoardPage.tsx` | 181–184 | `w-[200px] shrink-0` column width |
| `client/src/pages/ExecutionBoardPage.tsx` | 369, 422 | Inner `p-4`; `flex overflow-x-auto` scroll row |
| `client/src/components/boards/RequirementsKanban.tsx` | 112–114, 293 | `flex-1` columns (reference pattern) |
| `client/src/components/boards/StatusKanban.tsx` | 80 | `lg:grid-cols-5` equal grid (initiative kanban — different domain) |
| `client/src/App.tsx` | 1203–1210 | Route: `products/:productId/execution-board` |

---

## Out of scope (this design)

- Board filters row (shown in older wireframes but not in current ExecutionBoardPage)
- Column reorder / WIP limits
- Virtualized card lists
- Status Kanban / People Kanban layout unification (can follow same shared `KanbanBoard` layout component later)
