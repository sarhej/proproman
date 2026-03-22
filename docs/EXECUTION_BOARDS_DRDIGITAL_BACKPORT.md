# Execution boards: backport checklist for `drdigital`

This note supports merging the execution-boards redesign from **proproman** into the parent **drdigital** repo. Apply changes in dependency order: schema and migrations first, then API, import/export/MCP, then client and navigation.

## 1. Database (Prisma)

- **proproman:** `server/prisma/schema.prisma` — `TopLevelItemType`, `BoardProvider`, `BoardSyncState`; `Product.itemType`; models `ExecutionBoard`, `ExecutionColumn`; `Requirement.executionColumnId` (FK to column, `SetNull` on delete).
- **drdigital:** Locate the equivalent `schema.prisma` and merge the same enums and relations. Port the migration folder (e.g. `20260322150000_execution_boards`) or regenerate a migration against `drdigital` history if branch histories differ.
- **Guardrail:** Resolve any schema drift on shared DBs before `prisma migrate deploy`. Proproman saw drift on a remote DB (unrelated tables); fix or reset dev DBs before applying.

## 2. HTTP API

- **New router:** `server/src/routes/execution-boards.ts` (boards under `/api/products/:productId/execution-boards`, column CRUD, reorder). Mount in `server/src/index.ts`.
- **Products:** `server/src/routes/products.ts` — `itemType`, nested `executionBoards` / `columns`, `requirementStatusCounts`, requirement `executionColumn` include.
- **Requirements:** `server/src/routes/requirements.ts` — optional `executionColumnId`; updates apply column mapping to `status` / `isDone` via `server/src/services/requirementExecutionColumn.ts`.
- **UI settings:** `server/src/routes/ui-settings.ts` — `MANAGED_NAV_PATHS` must stay in sync with client; remove `/requirements/kanban` if it exists in `drdigital`.
- **Meta:** Update `server/src/routes/meta.ts` in `drdigital` if it mirrors enums or board metadata for the client.

## 3. Import / export, seed, MCP

- **Import-export:** `server/src/routes/import-export.ts` — `executionBoards` / `executionColumns` in export; import merge after products; requirements accept `executionColumnId` / external refs as in proproman.
- **Seed:** `server/prisma/seed.ts` — optional `itemType`, default board + columns per product.
- **MCP:** `server/src/mcp/tools.ts` — `itemType`, boards on tree/list, requirement `executionColumnId` on create/update.
- **Ontology:** `server/src/services/ontologyRefresh.ts` — primary route for feature/requirement area should point at product explorer (not global requirements kanban).

## 4. Client

- **Types / API:** `client/src/types/models.ts`, `client/src/lib/api.ts`.
- **Explorer:** `client/src/pages/ProductExplorerPage.tsx`, `client/src/components/product-tree/ProductTree.tsx` — Products & Systems copy, type badge, board summary, links to `/products/:id/execution-board` and `/products/:id/board-settings`.
- **Board UI:** `client/src/pages/ExecutionBoardPage.tsx`, `client/src/pages/BoardSettingsPage.tsx`.
- **Routing:** `client/src/App.tsx` — item-scoped routes; redirect `/requirements/kanban` → `/product-explorer`.
- **Nav:** `client/src/lib/navSections.ts`, `client/src/lib/navViewPaths.ts` — remove global requirements kanban entry; align `MANAGED_NAV_PATHS` with server.
- **Detail pages:** `FeatureDetailPage.tsx`, `RequirementDetailPage.tsx` — breadcrumb / back links use `productExplorerPage.*` i18n keys.
- **i18n:** `client/src/i18n/en.json` (and cs/sk/uk) — `nav.productExplorer`, `executionBoard`, `boardSettings`, `topLevelItem`, `productExplorerPage`; remove unused `nav.requirementsKanban` if present.
- **Tests:** `vitest.config.ts` setup order (`localStorage-polyfill` before i18n); `ExecutionBoardPage.test.tsx`; feature/requirement tests updated for new back-link copy.
- **HTTP integration (opt-in):** `server/src/routes/execution-boards.integration.test.ts` — run with `npm run test:integration` after `db:migrate`; excluded from default `npm test` via `vitest.config.ts` `exclude`. Uses `supertest` + auth stub + real Postgres.

## 5. Divergences to verify in `drdigital`

- **Route names:** If `drdigital` uses different paths for explorer or detail pages, adjust redirects and `ViewRoute` `path` props to match managed nav entries.
- **Permissions:** Proproman uses `canEditContent` for execution board DnD and board settings create/edit; `canEditStructure` for product-tree structure. Reconcile with `drdigital` role matrix.
- **Legacy:** `RequirementsKanban.tsx` / `RequirementsKanbanPage.tsx` may remain unused; safe to delete in `drdigital` after redirect and nav removal.
- **Multi-repo naming:** If the parent renames “Product” to something else in UI only, keep API model name `Product` unless a broader rename is planned.

## 6. Suggested merge strategy

1. One PR (or stacked PRs): Prisma + migration only, deployed to a staging DB.
2. PR: server routes + services + import/export + seed + MCP + ontology.
3. PR: client + i18n + tests.
4. Smoke: import/export round-trip with boards/columns; create product/system; open board; move requirement; board settings column reorder and `mappedStatus` behavior; old `/requirements/kanban` bookmark hits redirect.
