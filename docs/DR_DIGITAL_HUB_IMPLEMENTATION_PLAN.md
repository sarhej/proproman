# Dr Digital HUB backlog — implementation plan

**Constraint:** All work must be **non-breaking** and **minimal downtime** (no big-bang releases, no breaking API or DB changes; additive changes and backward-compatible deploys).

**Implementation notes:** Track implementation details **in the product** (Product Explorer), not only in docs. Each Dr Digital HUB **epic (initiative)** has implementation notes in its **Notes** field; open an epic in Product Explorer or the initiative panel to see them. To seed or refresh these notes: **via MCP** call **`drd_set_dr_hub_epic_implementation_notes`** (no arguments); or from `server/` run `npm run db:set-dr-hub-epic-notes`. You can also set notes on a single initiative with **`drd_update_initiative`** (pass `id` and `notes`). The markdown doc [DR_DIGITAL_HUB_REQUIREMENTS_IMPLEMENTATION_NOTES.md](DR_DIGITAL_HUB_REQUIREMENTS_IMPLEMENTATION_NOTES.md) is the source; edit the script or MCP tool and re-run to update the product.

---

## 1. Backlog summary (from populate script + EPIC_BUGS_FIX_PLAN)

| Epic | Features / scope | Requirements | Notes |
|------|-------------------|--------------|--------|
| **Epic 1: Naming & terminology** | 1 feature | 1.1–1.4 (4) | Domény→Pilíře, Partner/Klient, Integrace, Priority labels. Mostly i18n/config. |
| **Epic 2: Bugs (fix first)** | 6 features | 2.1–2.9 + “Edit feature title” | RACI, Initiative, Admin, Requirements, Accounts, Edit feature title. |
| **Epic 3: Feature/UX requirements** | 6 feature groups | 3.1–3.24 (24) | Initiative form, Gantt, Milestones, Campaigns, Accounts, Products. Some blocked by Epic 4. |
| **Epic 4: Clarifications needed** | 1 feature | 4.1–4.6 (6) | Decisions only; unblocks parts of Epic 3. |

**Total:** 4 epics, 14+ features, 40+ requirements (exact count depends on “Editovat název funkce” and any extras).

---

## 2. Current implementation status (as of this plan)

From codebase and [EPIC_BUGS_FIX_PLAN.md](EPIC_BUGS_FIX_PLAN.md):

| Req / item | Status | Note |
|------------|--------|------|
| **2.1, 2.5** RACI add | Done | POST /api/assignments; EDITOR can add. |
| **2.2** RACI edit (role + allocation) | Done | PUT /api/assignments (newRole, allocation); InitiativeDetailPanel RACI tab edits role + allocation. |
| **2.3** Initiative name edit | Done | InitiativeForm title in Details tab; verify visibility only. |
| **2.4** New initiative from main | Done | “New initiative” in nav → modal; verify placement only. |
| **2.6** Admin-only product/horizon/commercialType/dealStage | Done | Initiative PUT strips these fields for non-ADMIN; frontend should disable for non-admin (verify). |
| **2.7** Create new requirement | Done | Multiple entry points; verify only. |
| **2.8** Requirement without type | Done | RequirementDetailPage has “Unspecified” (null) for taskType. |
| **2.9** Edit accounts | Done | AccountsPage edit; verify/extend if product needs more fields. |
| **Edit feature title on feature screen** | Done | FeatureDetailPage: editable title, onFeatureUpdated, repair script BUSINESS_APPROVAL. |

**Remaining for Bugs epic:** Verification / UX polish (2.3, 2.4, 2.6 frontend, 2.7, 2.9) and optional board-level “New initiative” CTA if product asks.

**Epic 1 (Naming):** Not implemented; low risk if done as i18n keys + config.  
**Epic 3 (Feature/UX):** Not implemented; many items depend on Epic 4 clarifications.  
**Epic 4:** Decisions; no code.

---

## 3. Non-breaking and minimal-downtime principles

- **Additive only:** New endpoints, new optional fields, new UI; no removal of existing APIs or required fields without deprecation.
- **Migrations:** Additive migrations only (add column, add enum value); run `prisma migrate deploy` in preDeploy; no destructive steps.
- **Deploy order:** Migrations first (preDeploy), then app; single deploy is fine if migrations are backward-compatible.
- **Feature flags:** Optional for larger Epic 3 items (e.g. Gantt colours by status); not required for Bugs verification or Epic 1 i18n.
- **Rollback:** Any phase should be rollbackable by reverting the deploy; no one-way data migrations in these phases.

---

## 4. Proposed phases

### Phase 0 — Verification only (no code change, zero downtime)

**Goal:** Confirm existing behaviour and close Bugs items that are “verify only”.

| Action | Item | How |
|--------|------|-----|
| Verify | 2.3 Initiative name edit | Check Details tab: title field visible and editable. |
| Verify | 2.4 New initiative placement | Confirm nav “New initiative” is acceptable or note need for board CTA. |
| Verify | 2.6 Admin-only fields | Check InitiativeForm: product, horizon, commercialType, dealStage disabled (or hidden) for EDITOR. |
| Verify | 2.7 Requirement create | Smoke test: ProductTree, FeatureDetailPage, InitiativeDetailPanel, RequirementsPage — all allow adding requirement. |
| Verify | 2.9 Account edit | Confirm AccountsPage edit works; extend form if product needs segment/dealStage/etc. |

**Deliverable:** Checklist in EPIC_BUGS_FIX_PLAN or a short “Bugs verification” doc; optionally 1–2 tiny frontend tweaks (e.g. disable admin fields for non-admin). No new migrations; deploy = no-op or patch only.

**Can run:** Anytime; can be done in one pass.

---

### Phase 1 — Bugs verification + minimal UX (one run, non-breaking)

**Goal:** Close all Bugs epic items with minimal code: verification + any small fixes (e.g. disable initiative admin fields for non-admin, optional board “New initiative” button).

| Task | Risk | Downtime |
|------|------|----------|
| Disable productId, horizon, commercialType, dealStage in InitiativeForm for non-admin (if not already) | Low | None |
| Optional: add “New initiative” CTA on main board view if product requests it | Low | None |
| Document verification results for 2.3, 2.4, 2.7, 2.9 | None | None |

**Deliverable:** All Bugs acceptance criteria met; EPIC_BUGS_FIX_PLAN acceptance section updated. Single deploy; no DB migration if we only change frontend and docs.

**Recommended:** Do Phase 0 + Phase 1 together in **one run** (verification + small fixes + doc update).

---

### Phase 2 — Epic 1: Naming & terminology (non-breaking)

**Goal:** Implement 1.1–1.4 via i18n and config only. No schema or API changes.

| Req | Implementation | Risk | Downtime |
|-----|----------------|------|----------|
| 1.1 Domény → Pilíře | Add i18n keys (e.g. `domain` → “Pilíř” where appropriate); switch UI to keys. | Low | None |
| 1.2 Partner × Klient | Confirm usage in UI/docs; no change or doc-only. | Low | None |
| 1.3 Integrations / Integrace | Use “Integrations”/“Integrace” in UI/docs (i18n). | Low | None |
| 1.4 Priority | Add labels Critical/High/Medium/Low (i18n); use in filters/selects. | Low | None |

**Deliverable:** All user-facing strings go through i18n; one deploy. No migrations.

**Dependency:** None. Can follow Phase 1 or run in parallel with verification.

---

### Phase 3 — Epic 3 (Feature/UX): unblocked items only (additive)

**Goal:** Implement Epic 3 items that do **not** depend on Epic 4 clarifications. Each item is additive (new UI, new optional fields, or new behaviour behind existing APIs).

**Blocked by Epic 4 (do not implement in Phase 3):** 3.6 Jistota data, 3.7 Přiřazení tržeb, 3.10 Person radar, 3.14 Souřad s timingem, 3.19–3.21 (Kampaně concept), 4.x (Horizont format). See EPIC_BUGS_FIX_PLAN and Epic 4.

**Candidates for Phase 3 (illustrative; prioritise with product):**

- 3.1 Product/asset on initiative cards — additive display.
- 3.8 Save button in header — UX change; non-breaking.
- 3.11 Gantt colours by status — additive; optional feature flag if desired.
- 3.15–3.18 Milestones filters/charts — additive.
- 3.22 Accounts proklik na kampaně — additive link.
- 3.23–3.24 Products overview / filters — additive.

**Approach:** Pick a small batch (e.g. 3.1 + 3.8); implement; deploy; then next batch. Each deploy remains non-breaking and minimal downtime.

**Deliverable:** Phased Epic 3 backlog; each batch is a small release.

---

### Phase 4 — Epic 4 clarifications + remaining Epic 3

**Goal:** After product decisions on 4.1–4.6, implement dependent Epic 3 items (3.6, 3.7, 3.10, 3.14, Kampaně, Horizont). Plan these as separate small releases once clarifications are fixed.

---

## 5. One-run option (Phases 0 + 1 + optionally 2)

If you want **one run** with minimal change and zero risk:

1. **Phase 0 + 1:** Verification + minimal Bugs UX (disable admin fields for non-admin if needed, optional board CTA, update EPIC_BUGS_FIX_PLAN). Single deploy, no migrations.
2. **Optionally include Phase 2:** Add Epic 1 i18n (Pilíře, Integrace, Priority labels) in the same release; still no migrations, one deploy.

**Result:** Bugs epic closed, Naming epic done (if included), all non-breaking and minimal downtime. Epic 3 and 4 stay in later phases.

---

## 6. Rollout and deployment

- **Migrations:** Keep using existing preDeploy: `repair-migrations.cjs` then `prisma migrate deploy`. No new destructive migrations in this plan.
- **Deploy:** Single deploy per phase (or one run for Phase 0+1 or 0+1+2). No maintenance window required.
- **Rollback:** Revert deploy; DB remains compatible (additive migrations only).

---

## 7. Summary table

| Phase | Content | Breaking? | Downtime | Deploy |
|-------|---------|-----------|----------|--------|
| 0 | Verification only | No | None | Optional (docs only) |
| 1 | Bugs verification + minimal UX | No | None | One deploy |
| 0+1 (one run) | Verification + Bugs closure | No | None | One deploy |
| 2 | Epic 1 Naming (i18n) | No | None | One deploy |
| 0+1+2 (one run) | Verification + Bugs + Naming | No | None | One deploy |
| 3 | Epic 3 unblocked items (batched) | No | None | One deploy per batch |
| 4 | Epic 4 + dependent Epic 3 | No | None | After clarifications |

**Recommendation:** Do **Phase 0 + 1 in one run** (and optionally Phase 2) to close Bugs and Naming with a single, non-breaking deploy. Then schedule Epic 3 in small batches (Phase 3) and Epic 4–dependent work after clarifications (Phase 4).
