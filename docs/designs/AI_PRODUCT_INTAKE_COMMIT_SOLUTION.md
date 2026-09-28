# Phase 5 — Review drafts and create in hub

**Hub:** Initiative `cmpblw2ha000bms0q127a8ueq` · Feature `cmpblwcf5000lms0q0jb3dfv5` · Req `cmpblwkm3000zms0q9dksjicv`  
**Wireframe:** `docs/designs/AI_PRODUCT_INTAKE_COMMIT_WIREFRAMES.svg`  
**Schemas:** `docs/designs/AI_PRODUCT_INTAKE_PARSER_SCHEMAS.md` §7  

Status: **implementing** (wording + D1–D9 approved).

---

## 1. What this phase is for (plain language)

Phases 3–4 already turn messy input into **editable draft cards** (saved only on the intake session).

Phase 5 is the **decision + write** step:

1. You **check** each draft (edit anything wrong).
2. You **Approve for create** (include) or **Skip this** (leave out).
3. You choose **which Initiative** the new Features belong under.
4. You click **Create in hub** — that is the first time backlog rows are written.
5. You see a short **Created in hub** summary, then close.

Until Create in hub, Product Explorer / initiatives stay unchanged.

---

## 2. Screens (user journey)

### Screen 1 — Review each draft

**Job:** For every draft card, fix fields if needed, then Approve or Skip.

| UI element | Meaning |
|------------|---------|
| Status chip **Needs review** | You have not decided yet. Create in hub stays blocked while any card is in this state. |
| Status chip **Ready to create** | You approved; this draft will become hub rows. |
| Status chip **Left out** | You skipped; not created this run. |
| **Title** | Becomes the Feature title in the hub. |
| **Severity / Priority** (bug) | Impact + urgency. Still editable; stored on Feature `labels` at create. |
| **Problem / Solution / …** (feature) | Narrative fields from Phase 4; folded into Feature description at create. |
| **Acceptance criteria** | One line → one Requirement under the Feature. |
| **Skip this** | Mark **Left out** (partial create). Can undo before create. |
| **Approve for create** | Mark **Ready to create**. |
| **Create in hub (N ready)** | Disabled on this screen until every card is Ready or Left out, and N ≥ 1. |

### Screen 2 — Ready to create in hub

**Job:** Place Features under an Initiative, then create.

| UI element | Meaning |
|------------|---------|
| **Where should these Features go?** | Required. Features always hang under an Initiative on this product. |
| **Initiative** dropdown | Existing initiatives for the product, plus **Create new Initiative…**. |
| **Create in hub (N ready)** | Writes only Ready drafts (atomic transaction). |

**Discovery note (on card):** If draft priority is DISCOVERY, create maps to Feature `storyType: RESEARCH` and Requirement priority **P3** (explore, not ship).

### Screen 3 — Created successfully

**Job:** Confirm what was written; leave intake.

| UI element | Meaning |
|------------|---------|
| **Created in hub** list | Feature titles + story type; Requirements from AC; attachment note. |
| **Close** | Closes the dialog. Session is `COMMITTED` (drafts locked). Re-create is idempotent. |

---

## 3. Proposed user-facing copy (i18n)

| Key | Copy |
|-----|------|
| `intake.approvalNeedsReview` | Needs review |
| `intake.approvalReady` | Ready to create |
| `intake.approvalSkipped` | Left out |
| `intake.approveDraft` | Approve for create |
| `intake.skipDraft` | Skip this |
| `intake.createInHub` | Create in hub ({{count}} ready) |
| `intake.placementLabel` | Where should these Features go? |
| `intake.placementHint` | Every Feature must sit under an Initiative on this product. |
| `intake.placementCreateNew` | Create new Initiative… |
| `intake.commitSuccessTitle` | Created in hub |
| `intake.draftCommitHint` | Approve each draft, then Create in hub. Edits stay on this session until then. |
| `intake.discoveryCommitHint` | On create: story type becomes RESEARCH; requirements get priority P3. |

Internal API still uses `approval: pending | approved | skipped`.

---

## 4. Hub acceptance mapping

1. Drafts already generated in one pass (Phases 3–4) — keep.
2. UI lists drafts with **Approve for create** / **Skip this** (+ edit).
3. Field edits + `fieldProvenance` — keep.
4. Create in hub only when every **included** draft is approved (no Needs review left).
5. Partial create via Left out; link Features + attachments to session.

---

## 5. Scope decisions (please confirm)

| # | Decision | Proposal |
|---|----------|----------|
| D1 | Create gate | Enabled iff ≥1 Ready **and** zero Needs review. |
| D2 | Commit payload v1 | Feature drafts only (+ Requirements from AC / nested requirements). No Initiative-draft objects yet. |
| D3 | Placement | Resolve `route.initiativeId`, else Initiative picker, else Create new under product. Block if missing. |
| D4 | Discovery | → `RESEARCH` + P3 on Requirements; rationale stays in description. |
| D5 | Bug fields | `storyType: BUG`; `labels: { severity, priority, intakeSessionId }`; body in description. |
| D6 | Idempotency | Second commit returns prior created ids. |
| D7 | Attachments | Duplicate links onto new Feature ids; keep session links for audit. |
| D8 | Transaction | Initiative (if new) → Features → Requirements → links → `COMMITTED`. |
| D9 | Success UX | Summary + Close; drafts locked. |

### Deferred

OCR, URL fetch, Initiative-as-draft editor, bulk “Approve all”.

---

## 6. API (brief)

| Method | Path | Behavior |
|--------|------|----------|
| `PATCH` | `/:id/drafts/:draftKey` | Allow `{ approval: "approved" \| "skipped" \| "pending" }`. |
| `POST` | `/:id/commit` | Create Ready drafts; body may include `{ initiativeId }` / create-new flag. |

Errors: `409` if Needs review remain, nothing Ready, missing placement, or already committing; idempotent `200` if already committed.

---

## 7. Implementation order (after approval)

1. Branch `feat/ai-product-intake-commit`
2. Commit service + `POST …/commit` + tests
3. Shell: status chips, Approve/Skip, placement, Create in hub, success
4. i18n strings above
5. Playwright: approve → create → success
6. Schemas §7 update · PR · hub closeout

---

## 8. Test cases

### 8.1 Unit — `commitDrafts` mapping

| ID | Case | Expect |
|----|------|--------|
| U1 | Bug draft → Feature payload | `storyType BUG`, labels `{severity,priority,intakeSessionId}`, description includes steps/expected/actual/env |
| U2 | Feature FUNCTIONAL + P1 | storyType FUNCTIONAL; Requirements priority P1 |
| U3 | Feature DISCOVERY | storyType RESEARCH; Requirements priority P3; rationale in description |
| U4 | Feature TECH_DEBT + P2 | preserves TECH_DEBT; hub priority P2 |
| U5 | AC lines + nested requirements | both become Requirement rows (dedupe by title) |
| U6 | Empty AC, empty nested reqs | Feature only, zero Requirements |
| U7 | Gate: any pending | `canCommit` false |
| U8 | Gate: all skipped | `canCommit` false |
| U9 | Gate: mix approved+skipped, zero pending | `canCommit` true; only approved keys listed |
| U10 | Gate: all approved | `canCommit` true |

### 8.2 HTTP — `POST /:id/commit` + approval PATCH

| ID | Case | Expect |
|----|------|--------|
| H1 | Happy path BUG: 1 approved, initiativeId | 200; Feature+Reqs created; session COMMITTED; commitResult stored |
| H2 | Happy path FEATURE DISCOVERY | Feature RESEARCH; req P3 |
| H3 | Partial: 1 approved + 1 skipped | Only approved Feature created |
| H4 | Pending remains | 409 |
| H5 | Zero approved (all skipped) | 409 |
| H6 | Missing placement (no initiativeId / create) | 409 |
| H7 | createInitiative when no domains | 409 clear error |
| H8 | createInitiative with domain from sibling epic | 200; new Initiative + Features |
| H9 | Idempotent second commit | 200; same ids; no duplicate Feature.create |
| H10 | Already COMMITTING | 409 |
| H11 | No drafts yet | 409 |
| H12 | PATCH approval approved/skipped/pending | 200; chip state persists |
| H13 | PATCH approval on COMMITTED | 409 |
| H14 | Wrong tenant / unknown session | 404 |
| H15 | Attachments on session | AttachmentLink rows for new featureId; session links kept |

### 8.3 UI — ProductIntakeShell

| ID | Case | Expect |
|----|------|--------|
| C1 | After drafts: chips Needs review; Create disabled | |
| C2 | Approve for create → Ready; still disabled if another pending | |
| C3 | All decided + ≥1 ready → Create enabled | |
| C4 | Skip this → Left out; counts update | |
| C5 | Placement select required when no route.initiativeId | |
| C6 | Create in hub calls commit API; success panel | |
| C7 | Create failure shows error; drafts still editable | |
| C8 | COMMITTED: fields/actions disabled; Close works | |

### 8.4 Playwright (mocked API)

| ID | Case | Expect |
|----|------|--------|
| E1 | Create Bug → drafts → Approve → pick initiative → Create in hub → success | |
| E2 | Create Feature DISCOVERY → Approve → Create → shows RESEARCH in success | |
| E3 | Skip one of two → Create creates one | |

### 8.5 Edge / regression

| ID | Case | Expect |
|----|------|--------|
| X1 | Bug severity→priority remap still works with approval field | |
| X2 | Generate drafts message no longer says “later phase” after Phase 5 | |
| X3 | Escape/Cancel on REVIEWING abandons (not commit) | |
| X4 | Concurrent double-click Create | second gets idempotent or 409 COMMITTING — no dupes |

---

## 9. Ask / status

Wording + D1–D9 approved; implementing with the test matrix above.
