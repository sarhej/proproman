# Dr Digital HUB product — ownership and implementation workflow

## Ownership

**The Dr Digital HUB product (epics, features, and requirements) is owned by us** — we implement them in this project (the DrD Hub application itself). This product is the canonical backlog for improving the Hub: bugs to fix first, naming/terminology, Feature/UX work, and items blocked on clarifications.

- **Epics** = initiatives in the product (e.g. “Epic: Bugs (fix first)”, “Epic: Feature/UX requirements”).
- **Features** = user stories under an epic (e.g. “RACI”, “Editovat název funkce na obrazovce funkce”).
- **Requirements** = tasks under a feature (e.g. “2.1 Cannot add new stakeholders”, “Feature title editable on feature detail page”).

We must **check this backlog regularly**, decide what can be implemented, respect dependencies, and move work through statuses until stories reach **Business approval** and tasks are **Done**.

---

## Status flow (summary)

| Level | Status flow |
|-------|-------------|
| **Initiative (epic)** | IDEA → PLANNED → IN_PROGRESS → DONE (or BLOCKED). |
| **Feature (story)** | IDEA → PLANNED → IN_PROGRESS → **BUSINESS_APPROVAL** → DONE. |
| **Requirement (task)** | NOT_STARTED → IN_PROGRESS → TESTING → DONE. |

When a **story** is ready for product/business sign-off, set its status to **Business approval**. When all tasks under it are done and the story is accepted, set the story to **Done**.

---

## Regular workflow (what to do)

1. **Check status via MCP**  
   Use the DrD Hub MCP (local or remote) to inspect the Dr Digital HUB product:
   - **`drd_get_product_tree`** — full tree: product → initiatives → features → requirements (optionally pass `productId` for Dr Digital HUB; if omitted, returns first product).
   - **`drd_list_requirements`** (optional `featureId`) — tasks with assignee and status.
   - **`drd_list_features`** (optional `initiativeId`) — stories with status.

2. **Understand what can be implemented**  
   - Read titles, descriptions, and acceptance criteria.  
   - Note **dependencies** (e.g. Epic 4 clarifications block some Epic 3 items).  
   - Use existing docs (e.g. `docs/EPIC_BUGS_FIX_PLAN.md`) for “current state vs fix” and implementation order.

3. **Take work to “in progress”**  
   - Pick an epic/feature/requirement that is unblocked.  
   - Set **initiative** or **feature** to **PLANNED** if it was IDEA.  
   - Set **feature** to **IN_PROGRESS** when starting the story.  
   - Set **requirement (task)** to **IN_PROGRESS** when starting the task.  
   Use MCP tools:
   - **`drd_update_feature`** — set `status` to `PLANNED` or `IN_PROGRESS`.  
   - **`drd_update_requirement`** — set `status` to `IN_PROGRESS` (and optionally `assigneeId`).

4. **Move tasks through Testing**  
   - When a task is implemented and ready for QA, set requirement **status** to **TESTING**.  
   - **`drd_update_requirement`** — set `status` to `TESTING`.  
   - When QA is done, set to **DONE** (and `isDone: true` if your API expects it).

5. **Story to Business approval**  
   - When all tasks under a story are done (or agreed exceptions), set the **feature** status to **BUSINESS_APPROVAL**.  
   - **`drd_update_feature`** — set `status` to `BUSINESS_APPROVAL`.  
   - After product/business sign-off, set the feature to **DONE**.

6. **Epic progress**  
   - When all stories in an epic are done (or accepted), you can set the **initiative** status to **DONE** via **`drd_update_initiative`** (or leave it IN_PROGRESS until the whole epic is closed).

---

## MCP tools used in this workflow

| Tool | Use |
|------|-----|
| `drd_get_product_tree` | Inspect full Dr Digital HUB tree (epics → features → requirements) and their statuses. |
| `drd_list_features` | List stories (optional `initiativeId`) with status. |
| `drd_list_requirements` | List tasks (optional `featureId`) with status and assignee. |
| `drd_update_feature` | Change feature (story) status: PLANNED, IN_PROGRESS, BUSINESS_APPROVAL, DONE. |
| `drd_update_requirement` | Change requirement (task) status: IN_PROGRESS, TESTING, DONE; set assignee. |
| `drd_update_initiative` | Change initiative (epic) status when needed. |

See **docs/MCP_API_EXPOSURE.md** for full tool list, auth (OAuth remote / API key local), and how to connect Cursor to the DrD Hub MCP.

---

## Where the product lives

- **In the app:** Product Explorer (and boards) show the Dr Digital HUB product and its initiatives/features/requirements.  
- **Bootstrap:** `server/scripts/populate-dr-digital-hub.ts` creates the product and the four epics (Naming, Bugs, Feature/UX, Clarifications) with features and requirements if missing.  
- **Product name:** “Dr Digital HUB”. Use **`drd_list_products`** or **`drd_get_product_tree`** to get its `productId` when calling MCP with `productId`.

---

## Related docs

- **[DR_DIGITAL_HUB_IMPLEMENTATION_PLAN.md](DR_DIGITAL_HUB_IMPLEMENTATION_PLAN.md)** — Phased implementation plan: backlog summary, current status, phases (verification, Bugs closure, Naming, Epic 3/4), one-run option, non-breaking and minimal-downtime rules.  
- **Implementation details in the product:** Each Dr Digital HUB epic’s **Notes** field holds implementation details for that epic. Open Product Explorer → Dr Digital HUB → open an epic (initiative) → Details tab: the **Notes** field shows how to implement that epic. To seed/refresh notes: **via MCP** call **`drd_set_dr_hub_epic_implementation_notes`** (no args), or from `server/` run `npm run db:set-dr-hub-epic-notes`. Single epic: **`drd_update_initiative`** with `id` and `notes`. All tracking is in Product Explorer, not only in docs.  
- **[DR_DIGITAL_HUB_REQUIREMENTS_IMPLEMENTATION_NOTES.md](DR_DIGITAL_HUB_REQUIREMENTS_IMPLEMENTATION_NOTES.md)** — Source text for epic notes (and per-requirement details); the script `set-dr-hub-epic-implementation-notes.ts` pushes epic-level notes into the product.  
- **MCP_API_EXPOSURE.md** — MCP setup, tools, and troubleshooting.  
- **EPIC_BUGS_FIX_PLAN.md** — Bugs epic: current state vs fix, implementation order.  
- **FEATURES_REQUIREMENTS_DESIGN.md** — Feature/requirement UX and screens.
