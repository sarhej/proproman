# Instructions for coding agents: using Tymio end-to-end

**Audience:** Autonomous or interactive coding agents (Cursor, Claude Code, CI scripts) that need to **model work in Tymio**, **read what the org asked for**, and **map implementation back to the hub**.

**Standalone handoff (paste into an agent without this repo):** [CODING_AGENT_HANDOFF_TYMIO_APP.md](./CODING_AGENT_HANDOFF_TYMIO_APP.md) — `https://tymio.app` URLs, MCP paths, **§2 (401 + MCP must be connected + “applications” = Products)**, and stdio vs remote tool limits.

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

### 1.1 Keep Tymio facts in the documentation repository (do not rely on chat memory)

**For agents working inside a customer or product codebase:** maintain a **durable doc in that repo** (e.g. `docs/tymio.md`, `docs/integrations/TYMIO.md`, or `TYMIO.md` at the root) and **update it when integration details change**.

Record at least:

- **Environments:** production and staging **base URLs** for the Tymio web app and API.
- **Workspace:** **slug** (and tenant id if you use `X-Tenant-Id` for MCP/API automation).
- **Product line (optional label):** each Product has a **`slug`** unique within the workspace. In docs and prompts use **`workspace-slug/product-slug`** (e.g. `demo/tymio-app`) so scope is obvious. This is **identification only**: initiatives may have **no** product; agents can still create work across products in the same workspace.
- **MCP:** remote URL (`https://<host>/mcp`), auth method (OAuth vs API key / stdio), and any required headers.
- **REST:** prefixes you use (`/api/initiatives`, `/api/ontology`, etc.) and how you authenticate (session, Bearer).
- **Ontology / guides:** paths such as `/api/ontology`, `/api/agent/coding-guide`, MCP tools `tymio_get_agent_brief`, and where **`context/AGENT_BRIEF.md`** lives if checked in.
- **Product requirements in Tymio:** pointers to the right **initiatives**, **features**, or **requirements** (titles, ids, or stable links) so future sessions know *where the org’s ask is modeled*.
- **UI languages:** the web app ships **en, cs, sk, uk, pl** (see `GET /api/mcp/agent-context` → `supportedUiLocales`, and `https://tymio.app/llms.txt` on production). Workspaces may restrict the in-app picker via **`Tenant.settings.enabledLocales`**.

Treat that file as the **source of truth** for “how this repo talks to Tymio.” Chat threads and IDE sessions are ephemeral.

---

## 2. Mental model (minimum vocabulary)

- **Domain** (“pillar” in UI): strategic grouping for initiatives on boards.
- **Product** (in DB): **product line / asset**, not a SaaS tenant. Each row has **`name`** and a stable **`slug`** (per workspace). Groups initiatives in Product Explorer. There is **no separate “Application” entity** — multiple customer-facing or internal **apps/surfaces** are usually modeled as **multiple products** unless the org agrees otherwise.
- **Initiative:** roadmap item (often an **epic**); has priority, horizon, status, domain, owner, assignments, **features**, links to accounts/partners/demands/campaigns.
- **Feature:** deliverable under an initiative; holds **requirements** (delivery granularity).
- **Requirement:** checkable work item under a feature (kanban, detail pages).
- **Tenant (workspace):** customer organization. Data isolation is **`tenantId` on rows** + **`tenantResolver` / Prisma extension** for browser and API-key traffic when an active workspace is set. **Product** is still not a tenant — see **[HUB.md §1.2](./HUB.md#12-multi-tenancy-as-implemented)** for resolution order, memberships, and the **remote MCP tenant gap**.

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

- **Remote:** `POST https://<host>/mcp` with Zero-Trust OAuth (PKCE + Refresh Token Rotation). Configure your MCP client (Cursor, Claude Code, OpenClaw, etc.) to add a new MCP server of type `remote` (or SSE) with URL `https://<host>/mcp`. Initiate the connection, log in via the browser, and the agent automatically receives a stable, secure connection. No API keys to copy.
- **Local stdio:** `mcp/` package + `API_KEY` / `DRD_API_KEY`; see [mcp/README.md](../mcp/README.md). (Legacy/scripting approach).

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
| Supported UI locales (SEO, crawlers, agents) | Codes **en, cs, sk, uk, pl** — `GET /api/mcp/agent-context` → `supportedUiLocales`; static summary **`/llms.txt`**; HTML meta + JSON-LD in `client/index.html`. Server: `server/src/lib/appLocales.ts` (`getAppUiLocalesForPublicMeta`). |
| Workspace + product scope label | `workspace-slug/product-slug` (documentation; from Tenant.slug + Product.slug). See `GET /api/mcp/agent-context` field `scopeReference`. |
| Product & MCP overview | [docs/HUB.md](./HUB.md) |
| Ontology REST & MCP §6.1 | [docs/HUB.md](./HUB.md) |
| MCP stdio package | [mcp/README.md](../mcp/README.md) |
| Server MCP tool registration | `server/src/mcp/tools.ts` |
| Prisma schema | `server/prisma/schema.prisma` |
| UI nav config | `client/src/lib/navSections.ts` |
| Nav visibility API | `GET/PUT /api/ui-settings`, `server/src/routes/ui-settings.ts` |

---

*Document version: aligned with monorepo “Tymio” hub; extend when new modules or tool prefixes are added.*
