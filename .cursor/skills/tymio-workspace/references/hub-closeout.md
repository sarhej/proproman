# Hub closeout — Definition of Done (agents)

Agents must not claim Tymio-backed work is **done** until hub state matches reality. Waiting for the user to say “update the KB / close the tasks / rebuild atlas” is a failure mode.

## When closeout is mandatory

Closeout is **required** when **any** of these is true:

- The session resolved work to hub **initiative / feature / requirement** IDs (from MCP, REST, atlas, or user links).
- You changed production behavior, ops env, or storage that the hub epic/feature describes.
- You set or implied status **DONE**, **shipped**, or **deployed** in chat or a PR.

Closeout is **not** an invitation to invent backlog rows. If the work was ad-hoc chat with **no** hub IDs, do **not** create initiatives/features unless the user (or PO/PM skill process) asked for that.

## Mandatory steps (before saying “done”)

Run these on the **workspace MCP** URL (`…/t/<slug>/mcp`), with `workspaceSlug` matching the session:

1. **Update the leaf work items you shipped**
   - Requirements → done / status as the team uses them (`tymio_update_requirement` / upsert).
   - Features → `DONE` (or accurate `IN_PROGRESS` / `deployedToStage`) via `tymio_update_feature`.
   - Put **what shipped** (commits, PRs, env, verification) in **description** or epic **notes** — not only in chat.

2. **Update the parent initiative when the slice is complete**
   - If all features for that epic slice are done, set initiative `status` appropriately (`DONE` or keep `IN_PROGRESS` with honest **notes** listing follow-ups).
   - Refresh initiative **notes** so Product Explorer shows current truth.

3. **Rebuild the workspace atlas** when statuses or notes changed  
   - `tymio_rebuild_workspace_atlas` (EDITOR+).  
   - Confirm with `tymio_get_workspace_object` on the initiative/feature you closed if unsure.

4. **Repo / ops docs** (when applicable)  
   - If you changed how the product is operated (env vars, Workers, drivers), update the durable doc in the **customer/product repo** (`docs/tymio.md`, design/ops docs). Hub notes can link to that path.

5. **Do not claim hub updates** without a successful authenticated tool/REST response.

## Role split

| Role skill | Closeout duty |
|------------|----------------|
| **tymio-dev-agent** | After implementing hub-scoped work: update feature/requirement status + notes; trigger atlas rebuild; leave epic portfolio calls to PO/PM unless the epic is clearly complete. |
| **tymio-po-agent** | Verify acceptance vs hub requirements; close features/requirements; keep initiative notes accurate; rebuild atlas after batch status changes. |
| **tymio-pm-agent** | When a roadmap bet finishes: initiative status/horizon/notes; do not leave “Still open” notes that contradict DONE features. |
| **tymio-workspace** | Enforce OAuth + correct workspace; refuse “done” claims that skip this checklist when hub IDs were in scope. |

## Anti-patterns

- Shipping to production, marking chat “done,” leaving hub features `PLANNED`.
- Updating a feature to DONE but never rebuilding atlas (agents then read stale shards).
- Writing long epic notes in chat only — Product Explorer / atlas never see them.
- Creating new epics for closeout noise when an existing feature already tracks the work.
