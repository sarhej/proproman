# Epic: Bugs (fix first) — Verification checklist

**Product:** Dr Digital HUB  
**Date:** 2026-03-20  
**Result:** All items verified; acceptance criteria met.

---

## Checklist

| Id | Requirement | How to verify | Status |
|----|-------------|---------------|--------|
| 2.1/2.5 | RACI: add stakeholders | Initiative panel RACI tab or RaciMatrix: "Add" uses POST /api/assignments; EDITOR can add. | Verified |
| 2.2 | RACI: edit role and allocation | RACI tab: role dropdown and allocation input; updateRole and allocation blur call api.updateAssignment. | Verified |
| 2.3 | Initiative name editable | Open initiative → Details tab; title field visible and editable at top of form; save persists. | Verified |
| 2.4 | New initiative from main | Nav "New initiative" → `?new=1` → modal with InitiativeForm. Placement acceptable; board CTA optional if product requests. | Verified |
| 2.6 | Admin-only product, horizon, commercial type, deal stage | As EDITOR: open initiative edit; productId, horizon, commercialType, dealStage selects are disabled (adminOnlyFields={perms.isAdmin}). Backend strips these fields for non-ADMIN on PUT. | Verified |
| 2.7 | Create requirement entry points | ProductTree "Add requirement", FeatureDetailPage "Add requirement", InitiativeDetailPanel Features tab, RequirementsPage — all allow adding requirement (POST /api/requirements). | Verified |
| 2.8 | Requirement without type | RequirementDetailPage: taskType has "Unspecified" (null); create flows omit type; API accepts null. | Verified |
| 2.9 | Edit accounts | AccountsPage: pencil icon opens edit; edit name/type; save calls api.updateAccount. | Verified |
| — | Feature title on feature screen | FeatureDetailPage: feature title editable (Edit toggle + Save/Cancel); onFeatureUpdated updates board. | Verified |

---

## Verification note

Implementation was completed per [EPIC_BUGS_FIX_PLAN.md](EPIC_BUGS_FIX_PLAN.md) and [DR_DIGITAL_HUB_IMPLEMENTATION_PLAN.md](DR_DIGITAL_HUB_IMPLEMENTATION_PLAN.md). Backend and frontend behaviour (RACI, initiative form, admin-only fields, requirements, accounts, feature title) have been verified; acceptance criteria in EPIC_BUGS_FIX_PLAN section 5 are satisfied.
