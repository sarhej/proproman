# Epic: Bugs (fix first) — Fix plan

**Product:** Dr Digital HUB  
**Epic:** Epic: Bugs (fix first)  
**Context:** This plan is consistent with other Dr Digital HUB epics (Naming, Feature/UX, Clarifications, Accesses &amp; Roles) and avoids duplicating or conflicting with them.

---

## 1. Cross-epic context (constraints)

| Epic | Relevance to Bugs |
|------|-------------------|
| **Epic 1: Naming & terminology** | Do not hardcode labels that will change (Domény→Pilíře, Priority→Critical/High/Medium/Low). Prefer existing i18n keys; when adding new UI strings use keys that can be updated in one pass when Epic 1 is implemented. |
| **Epic 3: Feature/UX requirements** | Bugs = minimal “fix first” behaviour. Do **not** implement Epic 3 items here (e.g. Save in header 3.8, archivace UX 3.9, product/asset on cards 3.1). Only fix broken or missing core behaviour. |
| **Epic 4: Clarifications needed** | Do not implement features that depend on open clarifications (e.g. Jistota data 4.1, Přiřazení tržeb 4.2, Person radar 4.3, Gantt timing 4.4). |
| **Epic: Accesses &amp; Roles** | Archivace visibility/button placement is there. For Bugs we only ensure RACI and Admin edits work; we do not move archive button (that’s Epic Accesses). |

---

## 2. Current state vs fix (by requirement)

### 2.1–2.2, 2.5 — RACI: add and edit stakeholders

**Feature:** RACI – add and edit stakeholders

| Req | Current state | Fix |
|-----|----------------|-----|
| **2.1** Add stakeholders | ✅ Implemented: Initiative panel RACI tab (user + role dropdown, Add); RaciMatrix board (dropdown per cell). POST /api/assignments (ADMIN only). | **Verify:** Ensure EDITOR (or intended role) can add RACI if that’s the product intent; today only SUPER_ADMIN/ADMIN can create assignments. If product wants editors to add RACI, add `requireRole(..., UserRole.EDITOR)` for POST. |
| **2.2** Edit stakeholders | ⚠️ Partial: Remove (DELETE) exists. Change **role** for existing assignment = not supported (no PUT). Allocation can be updated via POST upsert but UI may not expose it. | **Implement:** (a) Add **PUT /api/assignments** (or PATCH) to update `role` and/or `allocation` for an existing assignment (initiativeId + userId + role composite). (b) In RACI UI (panel and/or RaciMatrix): allow editing role (e.g. dropdown) and allocation % where appropriate. (c) Keep DELETE for remove. |
| **2.5** RACI add people (same as 2.1) | Same as 2.1. | No separate fix; 2.1 covers it. |

**Implementation order:** 2.1 permission check → 2.2 backend PUT + frontend edit (role/allocation).

---

### 2.3 — Iniciativa: enable editing of initiative name

**Feature:** Iniciativa – edit name and create from main

| Req | Current state | Fix |
|-----|----------------|-----|
| **2.3** Edit initiative name | ✅ InitiativeForm has `title`; Details tab in InitiativeDetailPanel uses InitiativeForm; Save persists via `api.updateInitiative`. | **Verify/UX:** Ensure the title field is clearly visible and editable (e.g. at top of Details form). If the panel header shows title but doesn’t allow inline edit, that’s acceptable as long as Details tab has clear “Initiative name” edit. Optionally add inline edit in panel header (like Requirement detail) for consistency; treat as minor polish. |

**Implementation order:** Quick verification; optional header inline-edit if time.

---

### 2.4 — Create new Initiative from main page (top/priority area)

**Feature:** Iniciativa – edit name and create from main

| Req | Current state | Fix |
|-----|----------------|-----|
| **2.4** Create from main | ✅ Implemented: AppShell “New initiative” link → `/?new=1` → modal with InitiativeForm; `perms.canCreate` (ADMIN/SUPER_ADMIN) gates it. | **Verify placement:** Confirm with product that “top/priority area” is satisfied by the nav “New initiative” button. If they want a primary CTA on the board (e.g. top of initiative list or above filters), add a prominent “New initiative” on the main board view as well. |

**Implementation order:** Confirm with stakeholder; if needed, add one board-level “New initiative” CTA.

---

### 2.6 — Admin: add edit for product/assets, horizont, komerční typ, fáze obchodu

**Feature:** Admin – edit product/assets, horizont, typ, fáze

| Req | Current state | Fix |
|-----|----------------|-----|
| **2.6** Admin-only edit of product, horizon, commercial type, deal stage | ⚠️ InitiativeForm exposes productId, horizon, commercialType, dealStage to anyone with `readOnly === false` (i.e. EDITOR can edit). Backend PUT initiative uses `requireWriteAccess()` (ADMIN + EDITOR). | **Implement:** (a) **Backend:** Either accept productId/horizon/commercialType/dealStage only from ADMIN (e.g. strip or reject in PUT when role is EDITOR) or add a separate admin-only endpoint. Prefer: in initiatives PUT, allow these fields only when `req.user.role` is SUPER_ADMIN or ADMIN. (b) **Frontend:** In InitiativeForm (or InitiativeDetailPanel), pass a prop such as `adminOnlyFields: boolean`. When false, disable (or hide) productId, horizon, commercialType, dealStage so only admins can change them. Use existing `canEditStructure` or `isAdmin` from permissions. |

**Implementation order:** Backend first (restrict fields by role); then frontend disable/hide for non-admin.

---

### 2.7 — Požadavky: allow creating new requirement

**Feature:** Požadavky – create and typ spec

| Req | Current state | Fix |
|-----|----------------|-----|
| **2.7** Create new requirement | ✅ Implemented: ProductTree “Add requirement”, FeatureDetailPage “Add requirement”, InitiativeDetailPanel (Features tab), RequirementsPage. POST /api/requirements with requireWriteAccess (ADMIN/EDITOR). | **Verify:** All entry points work and are visible to editors. No code change expected unless a specific entry point is missing. |

**Implementation order:** Smoke test only.

---

### 2.8 — Allow requirement without specification type (web, marketing…)

**Feature:** Požadavky – create and typ spec

| Req | Current state | Fix |
|-----|----------------|-----|
| **2.8** Requirement without task type | ✅ API: taskType is optional (nullable). Create payloads often omit taskType (e.g. ProductTree, FeatureDetailPage use only featureId, title, isDone, priority). | **UI clarity:** (a) Requirement detail page: when editing, ensure “Type” (taskType) has an explicit option “Unspecified” / “None” that sends null. (b) If any create-requirement flow forces a task type, change it to optional with “Unspecified” default. (c) Do not add new “web/marketing” enum unless product asks; “unspecified” (null) is enough for this bug. |

**Implementation order:** Add “Unspecified” (null) to taskType selector on RequirementDetailPage and any create-requirement modal/dropdown if present.

---

### 2.9 — Účty: add edit for existing accounts

**Feature:** Účty – edit existing accounts

| Req | Current state | Fix |
|-----|----------------|-----|
| **2.9** Edit accounts | ✅ Implemented: AccountsPage has pencil icon, editName/editType, api.updateAccount; backend PUT /api/accounts/:id (ADMIN). | **Verify:** Edit is visible and works for admins. If segment/dealStage/strategicTier/arrImpact/renewalDate are needed in edit, extend the edit form and API payload; otherwise consider done. |

**Implementation order:** Verify; extend account edit form if product needs more fields.

---

### Extra: Edit feature name on feature screen

**Feature (Bugs epic):** “Editovat nazev funkce na obrazovce funkce”

| Req | Current state | Fix |
|-----|----------------|-----|
| Edit feature title on feature detail page | ⚠️ FeatureDetailPage shows feature.title in breadcrumb and as H1 but does not allow editing. ProductTree allows inline edit of feature title. | **Implement:** On FeatureDetailPage, make the feature title editable (e.g. inline edit or small “Edit” that toggles to input + Save). Call api.updateFeature(feature.id, { title }). Same permission as elsewhere: readOnly from props (canEditContent). |

**Implementation order:** After 2.1–2.2, 2.6, 2.8; can be done in parallel with 2.3/2.4 verification.

---

## 3. Implementation order (recommended)

1. **RACI (2.1, 2.2, 2.5)**  
   - 2.1: Confirm or adjust who can add RACI (backend role for POST assignments).  
   - 2.2: Backend PUT/PATCH for assignment (role + allocation); frontend edit in RACI tab and/or RaciMatrix.

2. **Admin-only initiative fields (2.6)**  
   - Backend: restrict productId, horizon, commercialType, dealStage to ADMIN (and SUPER_ADMIN) on initiative PUT.  
   - Frontend: disable or hide these fields when user is not admin.

3. **Requirement without type (2.8)**  
   - Requirement detail: add “Unspecified” (null) to taskType and ensure create flows don’t require type.

4. **Feature title on feature screen**  
   - FeatureDetailPage: editable feature title (inline or Edit toggle).

5. **Verification / small UX**  
   - 2.3: Initiative name edit visibility.  
   - 2.4: “New initiative” placement (nav vs board).  
   - 2.7: Requirement create entry points.  
   - 2.9: Account edit completeness.

---

## 4. Out of scope for this epic

- Moving “Save” to header (Epic 3.8).  
- Archivace UX and “Show archived” (Epic 3.9, Epic: Accesses &amp; Roles).  
- Product/asset on cards, document upload, Q1–Q4, comments redesign (Epic 3).  
- Any change that depends on Epic 4 clarifications (Jistota data, Přiřazení tržeb, Person radar, Gantt timing, Kampaně, Horizont format).  
- Terminology changes (Domény→Pilíře, Priority labels); use existing i18n until Epic 1 is done.

---

## 5. Acceptance criteria (summary)

- [x] 2.1/2.5: Intended roles can add RACI; 2.2: RACI assignments can be edited (role and/or allocation) and removed.  
- [x] 2.3: Initiative name is clearly editable (Details tab; optional header edit).  
- [x] 2.4: New initiative can be created from main (nav and, if required, board).  
- [x] 2.6: Only admins can change product, horizon, commercial type, deal stage on initiatives.  
- [x] 2.7: New requirements can be created from known entry points.  
- [x] 2.8: Requirements can be created/edited with no type (Unspecified / null).  
- [x] 2.9: Existing accounts can be edited (name, type; other fields if required).  
- [x] Feature screen: Feature title is editable on the feature detail page.

### Verification

Verified 2.3, 2.4, 2.6, 2.7, 2.9 (and 2.1/2.2/2.5, 2.8, feature title) on 2026-03-20; all pass. See [BUGS_VERIFICATION.md](BUGS_VERIFICATION.md) for the checklist.
