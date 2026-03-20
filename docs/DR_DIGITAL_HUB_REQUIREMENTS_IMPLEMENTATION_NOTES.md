# Dr Digital HUB — implementation notes per requirement

**Tracking:** Implementation details for each **epic** are stored in the product (Product Explorer): open an epic (initiative) and see the **Notes** field in the Details tab. To seed or refresh those notes from this doc, run from `server/`: `npm run db:set-dr-hub-epic-notes`. All epic-level implementation details are tracked there; this doc remains the source for the script and for per-requirement detail. See [DR_DIGITAL_HUB_IMPLEMENTATION_PLAN.md](DR_DIGITAL_HUB_IMPLEMENTATION_PLAN.md) for phases and status.

---

## Epic 1: Naming & terminology

| Req | Title | Way to implement |
|-----|--------|-------------------|
| **1.1** | Domény → Pilíře | **i18n only.** Replace user-facing "Doména/Domény" with "Pilíř/Pilíře" in CZ (and equivalent in SK/EN if needed). Files: `client/src/i18n/cs.json`, `sk.json`, `en.json` — keys under `domain`, `domains`, `domainBoard`, `priorityGrid.domain`, `filters`, etc. Use existing keys; add new keys only where the word appears in UI without a key (e.g. `productTree.selectDomain` → "Vyberte pilíř"). No API or DB change. |
| **1.2** | Partner × Klient | **Documentation / confirm.** PM requested: Partner = who buys, Klient = who uses. Check `client/src/i18n` and any labels for "Partner" / "Klient"; align with product. If already correct, add a short note in docs; no code change. |
| **1.3** | Integrations / Integrace | **i18n only.** Use "Integrations" (EN) and "Integrace" (CZ) wherever integration is mentioned. Search codebase for "integration" / "integrac"; add or update i18n keys so all UI strings use translations. No API or DB change. |
| **1.4** | Priority | **i18n + optional schema.** Prefer labels: Critical / High / Medium / Low. Add keys e.g. `priority.P0` = "Critical", `priority.P1` = "High", etc. in `client/src/i18n/*.json`. Use in FiltersBar, PriorityGrid, ProductTree, initiative/requirement selects. If P0–P3 are stored in DB, keep them; only change display labels. Files: i18n files; components that show priority (e.g. `FiltersBar`, `PriorityGrid`, `InitiativeForm`, requirement priority dropdown). |

**1.2 confirmed (2026-03-20):** Partner = who buys (nav/partners, demands); Klient = who uses (reflected as user/Kupující in buyer-user and persona impact). i18n uses Partner/Partneři; no code change needed.

---

## Epic 2: Bugs (fix first)

### Feature: RACI

| Req | Title | Way to implement |
|-----|--------|-------------------|
| **2.1** | Cannot add new stakeholders | **Done.** POST `/api/assignments`; role allows EDITOR. Verify: InitiativeDetailPanel RACI tab + RaciMatrix — "Add" uses `api.createAssignment`. If product wants only ADMIN to add, tighten `server/src/routes/assignments.ts` POST to `requireRole(..., UserRole.ADMIN)`. |
| **2.2** | Cannot edit stakeholders | **Done.** PUT `/api/assignments` with `initiativeId`, `userId`, `role`, and optional `newRole` and/or `allocation`. Frontend: `client/src/components/initiatives/InitiativeDetailPanel.tsx` — RACI tab has role dropdown and allocation input; `updateRole` and allocation blur call `api.updateAssignment`. Verify UI is visible and works. |
| **2.5** | RACI – cannot add people (repeated) | Same as 2.1; no separate implementation. |

### Feature: Iniciativa (Initiative)

| Req | Title | Way to implement |
|-----|--------|-------------------|
| **2.3** | Cannot change initiative name | **Done.** InitiativeForm has `title`; Details tab in InitiativeDetailPanel uses InitiativeForm; save calls `api.updateInitiative`. **Verify:** Title field is visible and editable at top of Details; optionally add inline edit in panel header (pattern: RequirementDetailPage title edit). Files: `InitiativeDetailPanel.tsx`, `InitiativeForm.tsx`. |
| **2.4** | Cannot create new Initiative from main page | **Done.** AppShell "New initiative" → `/?new=1` → modal with InitiativeForm. **Verify:** Confirm with product that nav placement is enough; if not, add a prominent "New initiative" CTA on main board (e.g. above FiltersBar or top of initiative list). Files: `App.tsx` (modal), `AppShell` / layout; optional: main board view component. |

### Feature: Admin

| Req | Title | Way to implement |
|-----|--------|-------------------|
| **2.6** | No way to edit product/assets, horizont, etc. | **Backend done:** Initiative PUT in `server/src/routes/initiatives.ts` strips `productId`, `horizon`, `commercialType`, `dealStage` for non-ADMIN (lines 289–294). **Frontend:** InitiativeForm already has `adminOnlyFields`; when false, product, horizon, commercialType, dealStage selects are disabled. Pass `adminOnlyFields={perms.isAdmin}` (or `canEditStructure`) from InitiativeDetailPanel and App create modal. **Verify:** As EDITOR, open initiative edit — these four fields must be disabled. Files: `InitiativeForm.tsx` (already has disabled when `readOnly` or not `adminOnlyFields`), call sites that pass `adminOnlyFields`. |

### Feature: Požadavky (Requirements)

| Req | Title | Way to implement |
|-----|--------|-------------------|
| **2.7** | Cannot add new requirement | **Done.** Entry points: ProductTree "Add requirement" (under feature), FeatureDetailPage "Add requirement", InitiativeDetailPanel Features tab, RequirementsPage. All use POST `/api/requirements` (requireWriteAccess). **Verify:** Smoke test all four entry points; ensure visible to EDITOR. |
| **2.8** | No option for requirement without specification type | **Done.** RequirementDetailPage has taskType select with option value `""` (Unspecified); save sends `taskType: editTaskType` (null). Create flows (ProductTree, FeatureDetailPage) omit taskType → API accepts null. **Verify:** Create requirement without type; edit and set "Unspecified"; confirm no validation forces a type. Files: `RequirementDetailPage.tsx` (taskType dropdown), `server/src/routes/requirements.ts` (taskType optional). |

### Feature: Účty (Accounts)

| Req | Title | Way to implement |
|-----|--------|-------------------|
| **2.9** | Cannot edit entered accounts | **Done.** AccountsPage: pencil icon opens edit; `editName` / `editType`; save calls `api.updateAccount(detail.id, { name, type })`. Backend: PUT `/api/accounts/:id` (ADMIN). **Verify:** Edit name and type; if product needs more fields (segment, dealStage, strategicTier, arrImpact, renewalDate), extend PUT body and form in `AccountsPage.tsx` and `server/src/routes/accounts.ts`. |

### Feature: Editovat název funkce na obrazovce funkce

| Req | Title | Way to implement |
|-----|--------|-------------------|
| (single) | Feature title editable on feature detail page | **Done.** FeatureDetailPage: "Edit title" toggles to Input + Save/Cancel; save calls `api.updateFeature(feature.id, { title })` and `onFeatureUpdated` so board state updates in place. App passes `onFeatureUpdated` that merges into `board.initiatives`. Files: `FeatureDetailPage.tsx`, `App.tsx` (route for `/features/:featureId`). |

---

## Epic 3: Feature/UX requirements

### Feature: Iniciativa – form & fields

| Req | Title | Way to implement |
|-----|--------|-------------------|
| **3.1** | Produkt / asset na kartách | Show product (or asset) name on initiative cards. **Way:** InitiativeCard or small card component receives initiative with `product`; display `initiative.product?.name` (or asset name if linked). Ensure GET initiatives include product; already in initiativeInclude. Files: `InitiativeCard.tsx`, card usages (boards, lists). |
| **3.2** | Upload dokumentu | Add document upload for initiative. **Way:** New optional field or relation (e.g. InitiativeDocument); multipart upload endpoint or S3 presigned URL; store key/URL on initiative or related table. Add UI in InitiativeDetailPanel (e.g. "Documents" section). Non-breaking: additive migration, optional field. |
| **3.3** | Horizont | Add quarters (Q1–Q4/rok), format e.g. Q1/2026 … Q4/2026. **Way:** Depends on Epic 4.6 (Horizont format). Option A: extend Horizon enum or add optional `quarter` / `quarterYear`; Option B: new table or JSON for quarter-based planning. Use in filters and Gantt. Blocked by 4.6. |
| **3.4** | Kritéria úspěchu (CK list) | Success criteria list already exists (PATCH/DELETE on success-criteria). **Way:** Link to Gantt completion: ensure Gantt task completion can drive or read from success criteria; may need new API or existing initiative milestones/KPIs. Check `server/src/routes/initiatives.ts` success-criteria routes and Gantt data source. |
| **3.5** | Poznámky → Komentáře | Replace notes with comment-style UI. **Way:** Initiative comments exist (POST/GET comments). Add or expand comment UI in InitiativeDetailPanel: date, author, larger area, formatting (e.g. simple markdown or rich text). Optionally deprecate single "notes" field in favour of comments. Additive: more comment fields or UI; migration only if removing notes. |
| **3.6** | Jistota data | **Blocked by Epic 4.1.** Confirm if "jistota data" is used; if not, remove. **Way:** Search codebase for usage; if none, remove field/UI and add migration to drop column (only after 4.1 decision). |
| **3.7** | Přiřazení tržeb | **Blocked by Epic 4.2.** Clarify with product/Jitka; then implement correct behaviour. **Way:** Revenue weights already on initiative; UI/UX and validation rules depend on clarification. |
| **3.8** | Uložit | Move Save button to header. **Way:** InitiativeDetailPanel (and InitiativeForm if used inline): move primary Save to sticky header or top bar. Non-breaking UX change. Files: `InitiativeDetailPanel.tsx`, possibly InitiativeForm layout. |
| **3.9** | Mazání vs. archivace | Do not allow hard delete; archive instead. **Way:** Initiative already has PATCH archive/unarchive; hide or remove Delete for initiatives (or restrict to SUPER_ADMIN) and expose "Archive" in UI. List views: add filter "Show archived". Additive: archive section or filter. |
| **3.10** | Person radar | **Blocked by Epic 4.3.** Decide if needed; keep or remove. **Way:** After 4.3, either remove Person radar UI/data or document and keep. |

### Feature: Gantt

| Req | Title | Way to implement |
|-----|--------|-------------------|
| **3.11** | Barvy podle stavu | Colour Gantt bars by initiative status (in progress, done, not started), not by domain. **Way:** Gantt page fetches timeline data; map initiative status to colour (e.g. statusKanban or custom palette). Change Gantt component to use `initiative.status` instead of `initiative.domain` for colour. Files: `GanttPage.tsx`, timeline/Gantt component, `server` timeline API if it returns status. |
| **3.12** | Úroveň dokončení | Show completion % from real progress; add state "prodlouženo" if initiative continues. **Way:** Completion can come from success criteria done/total, or milestones, or manual field. Add optional `completionPercent` or derive; Gantt bar shows it. "Prodlouženo" may be a status or tag; clarify with product. |
| **3.13** | Náhledy | Views by quarter and year. **Way:** Gantt time range selector: add "By quarter" and "By year" presets; adjust scale and range. Additive UI. |
| **3.14** | Souřad s timingem | **Blocked by Epic 4.4.** Clarify export/sync target; then implement. |

### Feature: Milníky (Milestones)

| Req | Title | Way to implement |
|-----|--------|-------------------|
| **3.15** | Filtry na součty stavů | Click on status box → filter to initiatives of that status. **Way:** Milestones timeline or board: status summary boxes (e.g. "In progress: 5"); make them clickable to set filter to that status. Use existing status filter state. Files: MilestonesTimelinePage or similar. |
| **3.16** | Archivace | Option to archive initiative/activity. **Way:** Same as 3.9; ensure archive action is visible in milestone/initiative context. |
| **3.17** | Graf (koláčový nebo jiný) | Chart for initiative status in period (e.g. Q1/2026), highlight critical/blocked. **Way:** Add a chart component (e.g. Chart.js or similar) on milestones or dashboard; data from initiatives filtered by period and status. Additive page or section. |
| **3.18** | Horizont v milestonech | Filters by Q1–Qx/YYYY. **Way:** Depends on 3.3/4.6 (quarter model). Add horizon/quarter filter to milestones view. |

### Feature: Kampaně (Campaigns)

| Req | Title | Way to implement |
|-----|--------|-------------------|
| **3.19** | Koncept kampaně | **Blocked by Epic 4.5.** Define with Nela; then decide UI placement. |
| **3.20** | Datum kampaně | In first/default view, show campaign date. **Way:** Campaign list or card: ensure campaign date is displayed; API likely already returns it. Check CampaignsPage and campaign model. |
| **3.21** | Číselník typu kampaně | Configure with Nela (reference list). **Way:** After 4.5, add campaign type reference (enum or table) and dropdown in campaign form. |

### Feature: Účty (Accounts)

| Req | Title | Way to implement |
|-----|--------|-------------------|
| **3.22** | Proklik na kampaně | From displayed campaign (e.g. "Znojmo") open that campaign. **Way:** AccountsPage or account detail: where campaign is shown, make it a link to `/campaigns/:id` or open campaign panel. Additive link. |

### Feature: Produkty / assets

| Req | Title | Way to implement |
|-----|--------|-------------------|
| **3.23** | Požadavky v přehledu? | **Decision.** Decide if requirements should appear in product/assets overview. If yes: ProductExplorer or product detail already has initiatives → features → requirements; optionally add a "Requirements" count or list per product. |
| **3.24** | Filtry | Filter by status and dopad (impact). **Way:** ProductExplorerPage or product tree: add filters for initiative status and impact (persona/revenue). Use existing FiltersBar or add product-level filter UI. |

---

## Epic 4: Clarifications needed

These are **product/decision** items. Implementation = document decision and then implement dependent Epic 3 items.

| Req | Title | Way to implement |
|-----|--------|-------------------|
| **4.1** | Jistota data | Confirm if used anywhere; if not → remove. **Way:** Search codebase; document; then remove field/UI (3.6) if not used. |
| **4.2** | Přiřazení tržeb | Align with product/Jitka; then implement correct behaviour (3.7). |
| **4.3** | Person radar | Confirm necessity; keep or drop (3.10). |
| **4.4** | Souřad s timingem z Gantu | Define system/format for Gantt timing export/sync (3.14). |
| **4.5** | Kampaně | Align with Nela; then implement campaign concept and UI (3.19, 3.21). |
| **4.6** | Horizont (Q1–Q4) | Final format and rules with Ondra; then implement quarter support (3.3, 3.18). |

---

## Quick reference: key files

| Area | Files |
|------|--------|
| i18n | `client/src/i18n/en.json`, `cs.json`, `sk.json` |
| Initiative edit | `client/src/components/initiatives/InitiativeForm.tsx`, `InitiativeDetailPanel.tsx` |
| RACI | `client/src/components/initiatives/InitiativeDetailPanel.tsx` (RACI tab), `server/src/routes/assignments.ts` |
| Feature title | `client/src/pages/FeatureDetailPage.tsx`, `App.tsx` |
| Requirements | `client/src/pages/RequirementDetailPage.tsx`, `server/src/routes/requirements.ts` |
| Accounts | `client/src/pages/AccountsPage.tsx`, `server/src/routes/accounts.ts` |
| Initiatives API | `server/src/routes/initiatives.ts` |
| Gantt | `client/src/pages/GanttPage.tsx`, timeline API |
| Milestones | `client/src/pages/MilestonesTimelinePage.tsx` |
| Product tree | `client/src/components/product-tree/ProductTree.tsx`, `client/src/pages/ProductExplorerPage.tsx` |
