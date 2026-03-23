# Backport instructions: proproman → drdigital (execution boards + related)

**Audience:** coding agent or developer merging work from the **proproman** repo into **drdigital** (parent product).

**Source of truth in proproman:** `main` branch. Key reference commits include execution-board feature work, migration `20260322210000_requirement_execution_sort_order`, and subsequent UI passes (FiltersBar visibility, Board settings link on execution board).

**Goal:** Bring **item-scoped execution boards** (per product/system), **column mapping to PM status**, **board settings**, **Products & Systems explorer** entry points, and **kanban ordering** into drdigital without breaking existing deployments, migrations, or permissions.

---

## 0. What you are porting (scope summary)

1. **Data model**
   - Enums: `TopLevelItemType`, `BoardProvider`, `BoardSyncState`.
   - `Product.itemType` (PRODUCT vs SYSTEM).
   - Models `ExecutionBoard`, `ExecutionColumn` (per board, ordered columns, `mappedStatus` → drives requirement `status` / `isDone` when a card is placed in a column).
   - `Requirement.executionColumnId` (nullable FK; orphan/unknown column IDs should behave as “unassigned” in UI).
   - `Requirement.executionSortOrder` — **order within a column (or unassigned bucket) on the board**; used with `POST /api/requirements/execution-layout` for full-board layout saves.

2. **Server**
   - `execution-boards` router: CRUD boards/columns, reorder columns.
   - `requirements` router: `executionColumnId` on create/update; `applyExecutionColumn` for column → status/isDone; **`nextExecutionSortOrder`** when column changes; **`POST /api/requirements/execution-layout`** (full product partition of requirements across columns + unassigned); Zod `executionBoardLayoutSchema` in `schemas.ts`.
   - `requirementExecutionColumn.ts`: `productIdForFeature`, `applyExecutionColumn`, **`nextExecutionSortOrder`**.
   - `products` route: nested `executionBoards` / columns, `itemType`, requirement includes where applicable.
   - `import-export`, `seed`, `MCP` tools, `ontologyRefresh` aligned with boards and explorer (no global requirements kanban as primary).

3. **Client**
   - Routes: `/products/:productId/execution-board`, `/products/:productId/board-settings`; redirect `/requirements/kanban` → `/product-explorer` (or equivalent).
   - **ExecutionBoardPage:** `@dnd-kit` sortable columns, **`useBoardData.refreshSilent`** after mutations (no global loading flash); **no local initiative/feature/search filters on the board**; **Board settings** link next to “Back to Products & Systems” with `?boardId=` when a board is selected.
   - **App.tsx:** `hideFilters` includes paths containing **`/execution-board`** and **`/board-settings`** so the **global FiltersBar** (pillar, owner, priority, etc.) does not show on those pages.
   - Explorer, nav, i18n, tests as listed in section 4 below.

4. **Ops**
   - Pre-deploy: `node server/scripts/pre-deploy.cjs` runs `prisma migrate deploy` (ensure migrations apply on deploy).

---

## 1. How to merge Git-wise (choose one path)

**A. Shared history / proproman is a branch of drdigital (or fast-forwardable)**  
- Create `feature/execution-boards-backport` from drdigital `main`.  
- Merge `proproman/main` (or a tag) and resolve conflicts, **or** cherry-pick commit ranges that correspond to the feature.

**B. Separate repos, similar tree**  
- Add proproman as remote: `git remote add proproman <proproman-url>`  
- `git fetch proproman`  
- Merge `proproman/main` into a drdigital branch **or** cherry-pick / `git format-patch` / `git am` per layer (see section 7).

**C. Migration history differs**  
- **Do not** blindly copy `server/prisma/migrations/*` folders if drdigital’s migration chain diverged.  
- Instead: **port the final Prisma schema** and generate **new** migrations in drdigital (`prisma migrate dev`) so they apply cleanly on drdigital’s DBs.  
- Preserve **semantic equivalence**: same tables, columns, indexes, FKs as proproman for execution boards + `executionSortOrder`.

**D. File-by-file port**  
- If merge is too noisy, use this document as a checklist and copy changes PR by PR (stacked), matching proproman behavior.

---

## 2. Database (Prisma) — dependency order: first

**In proproman (reference paths):**

| Area | Location |
|------|----------|
| Schema | `server/prisma/schema.prisma` |
| Migrations (examples) | `server/prisma/migrations/20260322150000_execution_boards/`, `server/prisma/migrations/20260322210000_requirement_execution_sort_order/` |

**Merge into drdigital:**

- Same enums, models, relations, and indexes (including `@@index([executionColumnId, executionSortOrder])` on `Requirement` if present in proproman).
- **Guardrail:** Resolve schema drift on staging before `prisma migrate deploy` on production.

---

## 3. HTTP API — second

| Concern | proproman reference |
|--------|----------------------|
| Boards router | `server/src/routes/execution-boards.ts`; mount in `server/src/index.ts` |
| Products | `server/src/routes/products.ts` — `itemType`, nested boards/columns, counts, requirement `executionColumn` include |
| Requirements | `server/src/routes/requirements.ts` — `executionColumnId`, `executionSortOrder`, `POST /execution-layout`, reorder feature-scoped reorder unchanged |
| Schemas | `server/src/routes/schemas.ts` — `executionBoardLayoutSchema` |
| Services | `server/src/services/requirementExecutionColumn.ts` |
| UI settings | `server/src/routes/ui-settings.ts` — `MANAGED_NAV_PATHS` in sync with client; drop `/requirements/kanban` if listed |
| Meta | `server/src/routes/meta.ts` if drdigital mirrors client enums / labels |
| Integration tests (opt-in) | `server/src/routes/execution-boards.integration.test.ts`, `vitest.integration.config.ts` |

---

## 4. Import / export, seed, MCP, ontology — third

- **Import-export:** `executionBoards` / `executionColumns` in export order; import after products; requirements carry `executionColumnId` / `executionSortOrder` as in proproman.
- **Seed:** `server/prisma/seed.ts` — optional `itemType`, default board + columns per product where applicable.
- **MCP:** `server/src/mcp/tools.ts` — product tree, `executionColumnId` on requirement create/update; align with HTTP behavior.
- **Ontology:** `server/src/services/ontologyRefresh.ts` — primary navigation for feature/requirement work points at **product explorer**, not a global requirements kanban.

---

## 5. Client — fourth

| Area | proproman reference |
|------|----------------------|
| Types / API client | `client/src/types/models.ts`, `client/src/lib/api.ts` |
| Board data hook | `client/src/hooks/useBoardData.ts` — `refreshSilent` for mutations without global `loading` |
| Explorer | `client/src/pages/ProductExplorerPage.tsx`, `client/src/components/product-tree/ProductTree.tsx` |
| Board pages | `client/src/pages/ExecutionBoardPage.tsx`, `client/src/pages/BoardSettingsPage.tsx` |
| App shell | `client/src/App.tsx` — routes, `hideFilters` for `/execution-board` and `/board-settings`, `ExecutionBoardPage` props |
| Nav | `client/src/lib/navSections.ts`, `client/src/lib/navViewPaths.ts` |
| Detail pages | `FeatureDetailPage.tsx`, `RequirementDetailPage.tsx` — back links / i18n |
| i18n | `client/src/i18n/en.json`, `cs.json`, `sk.json`, `uk.json` — execution board, board settings, product explorer, top-level item |
| Tests | `ExecutionBoardPage.test.tsx`, `BoardSettingsPage.test.tsx`, vitest setup / polyfills as in proproman |

**UX notes to preserve:**

- Execution board: **sortable** kanban within and across columns when **no** local filters (proproman removed initiative/feature/search from the board page).
- **Board settings** link remains in the execution board header (next to back to explorer), with `?boardId=` when applicable.
- **Global FiltersBar** hidden on execution-board and board-settings routes only (other pages unchanged).

---

## 6. Divergences to resolve in drdigital

- **Paths:** If explorer or detail URLs differ, update redirects, `ViewRoute` `path`, and `MANAGED_NAV_PATHS` consistently.
- **Permissions:** Map proproman’s `canEditContent` / `canEditStructure` to drdigital’s role matrix for board DnD, board settings, and tree edits.
- **Legacy:** After redirect + nav cleanup, `RequirementsKanban` / `RequirementsKanbanPage` may be removable if unused.
- **Naming:** UI may say “application” etc.; API model can stay `Product` unless drdigital mandates a rename project-wide.

---

## 7. Recommended stacked PRs (safe rollout)

1. **PR1 — Database only:** Prisma schema + migrations (staging deploy + `migrate deploy` + smoke query).
2. **PR2 — Server:** execution-boards router, requirements/products/ui-settings changes, `requirementExecutionColumn`, import-export, seed, MCP, ontology, unit tests.
3. **PR3 — Client:** explorer, execution board, board settings, App, nav, i18n, hooks, client tests.
4. **PR4 (optional):** Docs-only or cleanup (delete dead kanban components if approved).

After each PR: run **server + client** test suites; run **integration** tests only where Postgres is available (`RUN_DB_INTEGRATION_TESTS=1` or project equivalent).

---

## 8. Smoke test checklist (before production)

- [ ] New product/system: create board (or default seed), open **execution board**, move cards across columns — **status/isDone** match column `mappedStatus`.
- [ ] Reorder cards **vertically** within a column — order persists after refresh (`executionSortOrder` + layout API).
- [ ] **Board settings:** rename column, reorder columns, add/delete column (with confirmation), PM status mapping.
- [ ] **Import/export** round-trip includes boards/columns and requirement column assignments.
- [ ] Bookmark **`/requirements/kanban`** redirects to explorer (or agreed path).
- [ ] **Global FiltersBar** does not appear on execution-board or board-settings; still appears on other board views as intended.
- [ ] **No full-screen loading flash** when dragging cards (silent refresh path).

---

## 9. Reference design

- Wireframes (states, notes): `docs/designs/PRODUCTS_SYSTEMS_EXECUTION_BOARD_WIREFRAMES.svg` in proproman (if copied into drdigital, keep path or update links).

---

## 10. Quick file index (proproman paths)

Use ripgrep or `git log --oneline` on proproman `main` for “execution”, “ExecutionBoard”, `execution-layout`, `executionSortOrder`, `refreshSilent`, `hideFilters` to find exact commits if cherry-picking.

**Server:** `server/prisma/schema.prisma`, `server/prisma/migrations/`, `server/src/routes/execution-boards.ts`, `server/src/routes/requirements.ts`, `server/src/routes/schemas.ts`, `server/src/routes/products.ts`, `server/src/routes/import-export.ts`, `server/src/routes/ui-settings.ts`, `server/src/services/requirementExecutionColumn.ts`, `server/src/mcp/tools.ts`, `server/src/services/ontologyRefresh.ts`, `server/scripts/pre-deploy.cjs`, `server/src/index.ts`.

**Client:** `client/src/pages/ExecutionBoardPage.tsx`, `BoardSettingsPage.tsx`, `ProductExplorerPage.tsx`, `App.tsx`, `client/src/hooks/useBoardData.ts`, `client/src/lib/api.ts`, `client/src/types/models.ts`, `client/src/lib/navSections.ts`, `client/src/lib/navViewPaths.ts`, `client/src/i18n/*.json`, relevant tests under `client/src/pages/*.test.tsx`.

---

*End of backport instructions. Update this file in drdigital after merge if local paths or branch names differ.*
