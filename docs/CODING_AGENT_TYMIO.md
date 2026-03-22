# Instructions for coding agents: using Tymio end-to-end

**Audience:** Autonomous or interactive coding agents (Cursor, Claude Code, CI scripts) that need to **model work in Tymio**, **read what the org asked for**, and **map implementation back to the hub**.

**Canonical product overview:** [HUB.md](./HUB.md)  
**Generated ontology brief (repo file):** [context/AGENT_BRIEF.md](../context/AGENT_BRIEF.md) (do not hand-edit as source of truth; regenerate from the hub)

---

## 1. Which format works best?

| Format | Use when |
|--------|----------|
| **This Markdown doc** | Primary playbook: humans and agents read it from the repo, cite it in prompts (`@docs/CODING_AGENT_TYMIO.md`), or fetch via clone / zip. |
| **`context/AGENT_BRIEF.md`** | Compact, hub-authored map of **capabilities ↔ routes ↔ MCP tools ↔ models**; use after `ontology:refresh` or Admin export. |
| **MCP tools** | Live queries and mutations **as the signed-in user** (same RBAC as the browser). Prefer for “current state of initiatives/features/requirements”. |
| **REST (`/api/...`)** | Same as MCP under the hood; use when MCP is unavailable (curl, scripts with session cookie or API key). |

**Recommendation:** Treat **this file + `AGENT_BRIEF.md` + MCP** as the trio: *playbook*, *semantic map*, *live data*. For a single paste into a chat, prefer **sections 5–7 below** plus a pointer to `AGENT_BRIEF.md`.

---

## 2. Mental model (minimum vocabulary)

- **Domain** (“pillar” in UI): strategic grouping for initiatives on boards.
- **Product** (in DB): **product line / asset**, not a SaaS tenant. Groups initiatives in Product Explorer.
- **Initiative:** roadmap item (often an **epic**); has priority, horizon, status, domain, owner, assignments, **features**, links to accounts/partners/demands/campaigns.
- **Feature:** deliverable under an initiative; holds **requirements** (delivery granularity).
- **Requirement:** checkable work item under a feature (kanban, detail pages).

**Typical flow:** *Demand or idea → Initiative → Features → Requirements → status / Gantt / milestones.*

Schema source of truth: `server/prisma/schema.prisma`.

---

## 3. How you can connect (all sides)

### 3.1 Web UI (human or agent-assisted)

- **Product Explorer:** tree of products → initiatives → features; open details, notes, requirements.
- **Boards:** domain board, priority grid, RACI, status kanban, accountability, requirements kanban.
- **Planning:** milestones, calendar, Gantt.
- **Commercial / marketing:** accounts, partners, demands, campaigns (if enabled for the role).
- **Admin** (ADMIN / SUPER_ADMIN): users, settings (domains, personas, revenue streams), **Navigation views** (SUPER_ADMIN: hide shell routes for non–super-admins), data import/export, activity, notification rules, **Ontology**.

Agents usually **do not** drive the UI; they use API/MCP. UI is the source of truth for **who approved what** and **rich text notes**.

### 3.2 MCP (recommended for agents)

- **Remote:** `POST https://<host>/mcp` with OAuth (Google). Cursor config example: [HUB.md §6](./HUB.md), project `.cursor/mcp.json`.
- **Local stdio:** `mcp/` package + `API_KEY` / `DRD_API_KEY`; see [mcp/README.md](../mcp/README.md).

**First call for a new session:** `tymio_get_coding_agent_guide` (no arguments) returns this document as Markdown from the server so the agent does not rely on a local repo checkout.

**Tool families:**

- **Ontology (Tymio-prefixed):** `tymio_get_agent_brief`, `tymio_list_capabilities`, `tymio_get_capability` — **read** compiled brief and capability metadata.
- **Backlog / data (historical `drd_*` prefix):** health, meta, initiatives, features, requirements, domains, products, accounts, partners, demands, campaigns, timeline, assignments, stakeholders, etc. Full list: `server/src/mcp/tools.ts` (server) and `mcp/src/index.ts` (stdio subset).

Permissions match the **signed-in user** (or API-key user). **SUPER_ADMIN** is not implied unless that is the account.

### 3.3 REST API

- Base: same origin as app in production; local dev often `http://localhost:8080` with session cookie or `Authorization: Bearer <API_KEY>` for automation.
- Examples: `GET /api/meta`, `GET/POST /api/initiatives`, `GET/POST /api/features`, requirements, ontology endpoints under `/api/ontology/*`. See `server/src/routes/`.

### 3.4 Repo files & CLI

- **`context/AGENT_BRIEF.md`:** generated ontology for agents.
- **Refresh ontology + default bindings in DB:**  
  `npm run ontology:refresh --workspace server`  
  (needs `DATABASE_URL`; run on a machine that can reach the target DB.)
- **Export brief file on server filesystem:** Admin → Ontology → export, or `POST /api/ontology/export-file`.
- **Demo / structure scripts:** e.g. `npm run db:populate-tymio-demo --workspace server` (see `server/scripts/populate-tymio-demo-hub.ts`).

---

## 4. Roles and what they imply for an agent

Roles: `SUPER_ADMIN`, `ADMIN`, `EDITOR`, `MARKETING`, `VIEWER`, `PENDING`.

- **PENDING:** cannot use API meaningfully until promoted.
- **VIEWER:** read-heavy; mutating MCP/API calls may fail.
- **EDITOR / ADMIN / SUPER_ADMIN:** progressively more create/update/delete on structure and content.
- **SUPER_ADMIN only:** e.g. promote to SUPER_ADMIN, **PUT /api/ui-settings** (nav visibility), some destructive operations.

Always assume the **least privilege** of the connected identity.

---

## 5. Playbook A — From “as-is” to Tymio (structuring reality)

Use this when the org has an existing product or backlog (docs, tickets, spreadsheets) and wants it **represented in Tymio**.

1. **Capture “as-is”** (outside or inside Tymio):
   - Short **product / asset name** and owning team.
   - List of **themes** → candidate **initiatives (epics)**.
   - Under each epic: **features** and concrete **requirements** where possible.

2. **Align taxonomy in the hub** (ADMIN):
   - **Domains** (pillars), **products** (lines/assets), **personas** / **revenue streams** if used for reporting.

3. **Create structure** (EDITOR+ as appropriate):
   - Create **initiatives** linked to the right **domain** and **product**.
   - Add **features** under each initiative (Product Explorer or MCP/API).
   - Add **requirements** under features; use **Requirements Kanban** for status.

4. **Link commercial / marketing context** (if used):
   - **Accounts, partners, demands** tied to initiatives or features.
   - **Campaigns** tied to initiatives / accounts.

5. **Planning overlay:**
   - **Milestones**, **calendar**, **Gantt** for dates and dependencies.

6. **Optional:** run **`db:populate-tymio-demo`** only on **non-production** DBs if you want sample epics/features for a demo tenant.

7. **Ontology for agents:**
   - After schema or route changes, run **`ontology:refresh`** (or Admin compile/export) so **`AGENT_BRIEF.md`** and DB briefs stay accurate.

---

## 6. Playbook B — Read, implement, and manage requested features

### 6.1 Discover “what was asked”

1. Call **`tymio_get_agent_brief`** (or read `context/AGENT_BRIEF.md`) for **which MCP tools and routes** map to which **capabilities**.
2. **`drd_meta`** (or `GET /api/meta`) for domains, products, users, accounts, partners, personas, revenue streams.
3. **`drd_list_initiatives`** with filters if available, or search in UI Product Explorer.
4. Open **`drd_get_initiative`**, **`drd_list_features`** / feature detail, **`drd_list_requirements`** for the initiative you care about.
5. Read **notes** on initiatives/features (often contain acceptance criteria or “as-is” analysis).

### 6.2 Implement in code

1. Treat **requirements** as the finest hub-owned checklist items; **features** as shippable slices; **initiatives** as epics.
2. Map hub IDs (initiative / feature / requirement) into **commit messages**, **PR descriptions**, or **issue links** in your tracker so traceability is bidirectional.
3. After adding **routes, MCP tools, or Prisma models**, update hub **ontology** (Admin → Ontology) or run **`ontology:refresh`** so bindings stay true.

### 6.3 Manage state in Tymio (after shipping)

1. Update **requirement** status / **isDone** via API or **`drd_update_requirement`** (and related tools).
2. Move **initiative** status (e.g. to DONE) when the epic closes.
3. Record **decisions, risks, dependencies** if the team uses those modules (see MCP tools list).

### 6.4 If a shell view is “missing”

Non–super-admins may have **Navigation views** turned off. SUPER_ADMIN: **Admin → Settings → Navigation views**. You can still use **MCP/API** if the user’s role allows the underlying data.

---

## 7. Checklist before closing an agent task

- [ ] Initiative / feature / requirement IDs referenced or updated if the task was tracked in Tymio.
- [ ] Ontology refreshed or Admin compile run if you changed **API surface, routes, or tools**.
- [ ] No assumption of SUPER_ADMIN unless the connected account is one.
- [ ] Production DB: avoid destructive seeds and unreviewed **import** merges.

---

## 8. Quick reference paths

| Topic | Location |
|-------|----------|
| Product & MCP overview | [docs/HUB.md](./HUB.md) |
| Ontology REST & MCP §6.1 | [docs/HUB.md](./HUB.md) |
| MCP stdio package | [mcp/README.md](../mcp/README.md) |
| Server MCP tool registration | `server/src/mcp/tools.ts` |
| Prisma schema | `server/prisma/schema.prisma` |
| UI nav config | `client/src/lib/navSections.ts` |
| Nav visibility API | `GET/PUT /api/ui-settings`, `server/src/routes/ui-settings.ts` |

---

*Document version: aligned with monorepo “Tymio” hub; extend when new modules or tool prefixes are added.*
