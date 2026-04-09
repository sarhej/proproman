# Tymio — instructions for coding agents (standalone handoff)

**Use:** Copy this entire file into another agent’s context. It does **not** assume access to the Tymio source repository.

**Product:** [Tymio](https://tymio.app) — product and project hub (initiatives, features, requirements, boards, planning, optional B2B/marketing modules).

---

## 1. Production URLs (tymio.app)

| Purpose | URL |
|--------|-----|
| Web app | `https://tymio.app` |
| REST API base | `https://tymio.app/api` |
| Health | `GET https://tymio.app/api/health` |
| **MCP (Streamable HTTP)** | `POST https://tymio.app/mcp` |
| OAuth protected-resource metadata (MCP discovery) | `GET https://tymio.app/.well-known/oauth-protected-resource/mcp` |
| Google OAuth — **browser sign-in** callback | `https://tymio.app/api/auth/google/callback` |
| Google OAuth — **remote MCP** callback | `https://tymio.app/mcp-oauth/google/callback` |
| Coding-agent playbook (Markdown, **authenticated**) | `GET https://tymio.app/api/agent/coding-guide` — session cookie or `Authorization: Bearer <API_KEY>` (same rules as API) |
| **Public agent + SEO context (JSON)** | `GET https://tymio.app/api/mcp/agent-context` — includes **`supportedUiLocales`**, **`scopeReference`**, **`feedbackReporting`**, **`tymioMcpCliAgentGuidanceMarkdown`** (full CLI/OAuth guide), **`tymioMcpNoUserSettingsApiKey`: true** |
| **LLM / crawler site summary (Markdown)** | `https://tymio.app/llms.txt` — product overview, supported UI languages, MCP/API pointers |
| Crawl policy | `https://tymio.app/robots.txt` |

If you are pointed at a **staging or custom host**, replace `https://tymio.app` with that origin everywhere; paths stay the same.

---

## 2. Read first: live access, auth, and “applications”

### 2.1 Nothing on the tenant works without authentication

- **`GET https://tymio.app/api/meta` (and almost all `/api/*`) returns 401** unless you send a **valid session cookie** (browser) or **`Authorization: Bearer <API_KEY>`** where the deployment has **`API_KEY`** set. There is **no** public, anonymous meta or write API.
- If your environment has **no** API key and **no** browser session, you **cannot** create or list products, initiatives, etc. via REST. Say so explicitly to the user; do not imply data was changed on their tenant.

### 2.2 MCP tools only exist when the client is connected

- Tools such as **`drd_meta`**, **`drd_create_product`**, **`tymio_get_agent_brief`** are available **only** if this chat/agent runtime has a **working Tymio MCP** configuration (remote URL + OAuth, or stdio + `DRD_API_BASE_URL` + `DRD_API_KEY`).
- If **`user-tymio` / `tymio` tools are missing, not registered, or calls fail with connection/auth errors**, you are **not** connected to Tymio. You **must not** behave as if MCP mutations ran successfully. Tell the user to enable remote MCP (`https://tymio.app/mcp` + Google) or provide **`DRD_API_KEY`** (same value as server **`API_KEY`**) for stdio/scripts.
- **Do not tell users to copy an MCP API key from Tymio Settings, Profile, or Account** — that path does **not** exist. **`API_KEY` / `DRD_API_KEY`** for automation is a **deployment secret** configured by operators, not a personal user setting. For OAuth stdio, users run **`tymio-mcp login`** (npm package **`@tymio/mcp-server`**). Full wording: repo **`mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md`**, shell **`tymio-mcp instructions`**, or **`GET /api/mcp/agent-context`** → **`tymioMcpCliAgentGuidanceMarkdown`**.

### 2.3 “Applications” in everyday language → **Product** in Tymio

- Tymio has **no separate “Application” (or “App”) entity** in the hub. The field that groups roadmap work for a **surface** (e.g. landing site, admin UI, internal playground) is **Product** — in the model it is a **product line / asset**, not a SaaS tenant.
- If someone asks for **three applications** (e.g. Landing, Admin, Playground), the correct mapping is usually **three Products**, each holding its own initiatives/features — unless the organization explicitly uses another convention.
- After creating products, initiatives belong under a **Domain** (pillar) and a **Product**; use **`drd_meta`** / **`GET /api/meta`** for `domainId` / `productId` when automating.

### 2.4 If you cannot connect

Give the user **actionable** options:

1. **UI:** As **Admin / Super admin** (or **Editor** where allowed), create products and initiatives in **Product Explorer** (or equivalent admin surfaces).
2. **REST:** User exports **`API_KEY`** from deployment secrets and runs scripts with **`Authorization: Bearer …`** to `https://tymio.app/api/...`.
3. **MCP:** User configures Cursor (or another client) with **remote** `https://tymio.app/mcp` and clicks Connect to complete the Zero-Trust OAuth flow in the browser (no API keys to copy), or runs the **stdio** MCP with **`DRD_API_BASE_URL`** + **`DRD_API_KEY`**.

Do **not** add repository-only helper scripts unless the user’s repo and workflow expect them; this handoff does not assume a checkout. Prefer documenting the **API/MCP/UI** paths above.

---

## 3. How to connect an agent

### 3.1 Remote MCP (recommended for Cursor, Claude Code, OpenClaw, and modern MCP clients)

- **Endpoint:** `POST https://tymio.app/mcp`
- **Auth:** Zero-Trust OAuth 2.1 with PKCE and Refresh Token Rotation.
- **Setup:** In your MCP client (e.g., Cursor, Claude Code, OpenClaw), add a new MCP server of type `remote` (or SSE) with the URL `https://tymio.app/mcp`. Initiate the connection. The agent will open a browser window. Log in to Tymio, and the browser will automatically redirect back to the agent to establish a stable, secure connection. **No API keys to copy or paste.**
- **Identity:** Requests run as the **signed-in Google user**, with the same role and permissions as in the browser.

**Cursor-style config example (remote):**

```json
{
  "mcpServers": {
    "tymio": {
      "url": "https://tymio.app/mcp"
    }
  }
}
```

### 3.2 REST API (curl, scripts, or agents without MCP)

- **Base:** `https://tymio.app/api`
- **Auth:** Logged-in **session cookie** from the browser, or **`Authorization: Bearer <API_KEY>`** when the deployment has `API_KEY` configured (automation user; role is fixed server-side).

### 3.3 Local stdio MCP package (`@tymio/mcp-server`, optional)

The published CLI is **`tymio-mcp`** (**`@tymio/mcp-server`**). **Default (recommended):** **do not** set `DRD_API_KEY` / `API_KEY` on the MCP process — run **`tymio-mcp login`** once; the binary proxies the **hosted** `/mcp` tool list over OAuth (same as remote URL in the IDE). Canonical agent Markdown: **`mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md`** / **`tymio-mcp instructions`**.

**API-key / REST subset mode (CI, scripts):** set `DRD_API_BASE_URL=https://tymio.app` and `DRD_API_KEY=<same value as server API_KEY>` on the **stdio process**. That value is the **server** automation secret — **not** something users obtain from the Tymio UI. This mode exposes **only a subset** of tools (see section 6). For the **full** tool surface, use **remote** `POST https://tymio.app/mcp` or stdio **without** those env vars after `tymio-mcp login`.

---

## 4. MCP tool names (remote server at `/mcp`)

Tool names use a historical `drd_` prefix for backlog/data operations; `tymio_` prefix is used for ontology and this playbook. **What “capabilities” and bindings mean in the product** — and how they map to REST — is spelled out in **§5**.

**Ontology and playbook**

- `tymio_get_coding_agent_guide` — returns the server’s full coding-agent Markdown (no arguments). That copy is aimed at **developers with the repo** and may mention file paths; **this handoff file** is the portable version for agents without the codebase.
- `tymio_get_agent_brief` — compiled capability brief (Markdown/JSON per tool parameters).
- `tymio_list_capabilities` — list capabilities.
- `tymio_get_capability` — one capability by `id` or `slug`.

**Health and meta**

- `drd_health`
- `drd_meta`

**Initiatives**

- `drd_list_initiatives`, `drd_get_initiative`, `drd_create_initiative`, `drd_update_initiative`, `drd_delete_initiative`
- `drd_set_dr_hub_epic_implementation_notes` (specialized; name may reflect legacy demo content)

**Taxonomy / catalog**

- `drd_list_domains`, `drd_list_products`, `drd_create_product`, `drd_update_product`, `drd_get_product_tree`
- `drd_list_personas`, `drd_list_accounts`, `drd_list_partners`, `drd_list_kpis`, `drd_list_milestones`, `drd_list_demands`, `drd_list_revenue_streams`

**Features and requirements**

- `drd_list_features`, `drd_create_feature`, `drd_update_feature`
- `drd_list_requirements`, `drd_create_requirement`, `drd_update_requirement`, `drd_upsert_requirement`

**Other work context**

- `drd_list_decisions`, `drd_list_risks`, `drd_list_dependencies`
- `drd_list_assignments`, `drd_list_stakeholders`
- `drd_timeline_calendar`, `drd_timeline_gantt`

**Campaigns / assets (if enabled for the role)**

- `drd_list_campaigns`, `drd_get_campaign`, `drd_list_assets`, `drd_list_campaign_links`

---

## 5. Ontology and capabilities (what they are, why agents care)

Tymio’s **ontology** is a **semantic map of product capabilities**: things users (and agents) can do in the hub, described in plain language and **bound** to concrete implementation hooks (routes, pages, MCP tools, Prisma models, etc.). It is **not** the same as a **Product** entity in the database (product line / surface for initiatives).

### 5.1 Core concepts

| Concept | Meaning |
|--------|---------|
| **Capability** | One named “thing the hub offers”: stable `slug` (kebab-case), `title`, optional `description`, **user job** (what the user is trying to accomplish), optional synonyms and “do not confuse with”, `status`, `sortOrder`, optional parent for hierarchy. |
| **Binding** | Links a capability to an artifact: a **type** + **key** (e.g. MCP tool name, app route). Optional `notes`, `isPrimary`, and `generated` (true when seeded from the codebase manifest). |
| **Compiled brief** | A **Markdown or JSON** document aggregating capabilities (and their bindings) for agents. Stored in the DB after an admin **compile**; also computable on the fly via GET. |

**Statuses:** `ACTIVE` (in use), `DRAFT` (work in progress), `DEPRECATED` (phasing out).

**Binding types** (use the key as the identifier for that layer):

- **`ROUTE`** — Client route path (e.g. `/product-explorer`, `/admin`).
- **`PAGE`** — Frontend page component name (e.g. `AdminPage`).
- **`API_ROUTE`** — REST path pattern where relevant.
- **`MCP_TOOL`** — MCP tool name (e.g. `drd_list_initiatives`, `tymio_get_agent_brief`).
- **`PRISMA_MODEL`** — Data model name (e.g. `Initiative`, `Requirement`).
- **`FILE_GLOB`** — Repository file patterns when documented.
- **`INFRA`** — Pointer to infra or code modules (e.g. MCP registration file).
- **`FIGMA_NODE`** (optional) — Stable Figma file + node identifier for a **capability** (not a backlog row). Prefer `fileKey:nodeId` with the node id in Figma’s colon form (from a share URL, replace hyphens in `node-id` with colons). Example: `AbCdEfGhIj:1:234`.
- **`DESIGN_REF`** (optional) — Tool-agnostic design anchor: full `https://…` URL, Penpot link, Confluence/Notion page, or a short stable id your team agrees on.

**Backlog vs ontology for design:** Row-level links (initiative / feature / requirement) still live in **`notes`**, **`description`**, **`externalRef`** as in **`docs/DESIGN_REFERENCES.md`**. **`FIGMA_NODE` / `DESIGN_REF`** bindings attach **design context to a capability** so agents and briefs can cite “this surface ↔ this frame” alongside routes and MCP tools. Use both when a capability spans many screens and you want one canonical design anchor on the capability itself.

### 5.2 Where data lives and who can change it

- **Storage:** PostgreSQL — `Capability`, `CapabilityBinding`, and `CompiledBrief` (cached compiled output).
- **UI:** **Admin** (role `ADMIN` / `SUPER_ADMIN`) → **Ontology** tab: list/edit capabilities and bindings, **Refresh default bindings**, **Compile & store briefs**, preview/export Markdown.
- **Code manifest:** The server ships a **default capability list** (slugs, titles, user jobs, and generated bindings to routes/tools/models). **“Refresh default bindings”** calls `POST /api/ontology/refresh-bindings`, which **upserts** those defaults and marks matching bindings as `generated`. It does not wipe arbitrary custom capabilities you added by hand; it aligns the known default set with the manifest.

### 5.3 REST API (`/api/ontology`, all routes require authentication)

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| `GET` | `/capabilities` | Any signed-in user | List capabilities; optional query `status` = `ACTIVE`, `DRAFT`, or `DEPRECATED`. Includes bindings. |
| `GET` | `/capabilities/:id` | Any | One capability by id. |
| `GET` | `/capabilities/by-slug/:slug` | Any | One capability by slug. |
| `GET` | `/brief` | Any | Compiled brief: `format=md` (default) or `json`; `mode=compact` (default, **ACTIVE only**) or `full` (**ACTIVE + DRAFT**); optional `cached=true` to serve last stored compile if present. |
| `POST` | `/capabilities` | Admin | Create capability. |
| `PUT` | `/capabilities/:id` | Admin | Update capability (slug not changed here). |
| `DELETE` | `/capabilities/:id` | Admin | Delete capability (cascades bindings). |
| `POST` | `/bindings` | Admin | Add binding. |
| `DELETE` | `/bindings/:id` | Admin | Remove binding. |
| `POST` | `/compile` | Admin | Regenerate and **store** compiled briefs (compact + full, Markdown + JSON). |
| `POST` | `/refresh-bindings` | Admin | Run default manifest upsert (see §5.2). |
| `POST` | `/export-file` | Admin | Write Markdown brief to a path on the **server filesystem** (default in repo deployments: `context/AGENT_BRIEF.md`). On **hosted** environments without a writable repo checkout, prefer **`GET /brief`** or MCP **`tymio_get_agent_brief`** instead of relying on export. |

Base URL: `https://tymio.app/api/ontology` (same auth as the rest of `/api`).

### 5.4 MCP tools tied to ontology

- **`tymio_list_capabilities`** — List capabilities (aligned with hub data).
- **`tymio_get_capability`** — One capability by `id` or `slug`.
- **`tymio_get_agent_brief`** — Compiled brief (same idea as `GET /api/ontology/brief`; parameters depend on server implementation).

Use these when you need a **structured map** of surfaces and tools without parsing the UI.

### 5.5 How agents should use this

1. **Before** proposing new features or assuming a screen exists, call **`tymio_get_agent_brief`** or **`GET /api/ontology/brief`** (or list capabilities) so your plan matches **existing** routes, models, and MCP tools.
2. After **shipping** API or MCP changes, a human with admin access should **refresh default bindings** and **recompile** briefs (or update capabilities manually) so the ontology stays truthful — see checklist §12.

---

## 6. Stdio MCP subset (when using `DRD_API_BASE_URL`)

If the client uses the **stdio** bridge against `https://tymio.app`, expect **only**:

`drd_health`, `drd_meta`, `drd_list_initiatives`, `drd_get_initiative`, `drd_create_initiative`, `drd_update_initiative`, `drd_delete_initiative`, `drd_list_domains`, `drd_list_products`, `drd_list_personas`, `drd_list_accounts`, `drd_list_partners`, `drd_list_kpis`, `drd_list_milestones`, `drd_list_demands`, `drd_list_revenue_streams`, `tymio_get_coding_agent_guide`, `tymio_get_agent_brief`, `tymio_list_capabilities`, `tymio_get_capability`.

**Note:** **`drd_create_product`** is **not** in the stdio subset — use **remote MCP** or **REST** `POST /api/products` with a Bearer token to create products from automation.

---

## 7. REST endpoints agents often need

All under `https://tymio.app/api` unless noted. All require auth unless documented otherwise.

- `GET /meta` — domains, products, users, accounts, partners, personas, revenue streams. Response shape is JSON; products are typically under a **`products`** array (confirm in your tenant’s response if you write a parser).
- `GET|POST /initiatives`, `GET|PATCH|DELETE /initiatives/:id`, etc.
- `GET|POST /features`, `GET|PATCH|DELETE /features/:id`, etc.
- `GET|POST /requirements`, …
- `GET|POST /products`, … (create/update products for multi-surface taxonomies)
- **Ontology:** full path and roles are documented in **§5** (`/api/ontology/...`).

Use **GET** `/agent/coding-guide` with the same auth as above for the playbook as raw Markdown.

---

## 8. Mental model (minimum vocabulary)

- **Domain** (pillar): strategic grouping for initiatives on boards.
- **Product:** product line / asset — groups initiatives (**not** a SaaS tenant). This is what you use for separate **apps/surfaces** in plain language (multiple products = multiple surfaces), unless the org defines otherwise.
- **Initiative:** roadmap item (often epic-level); links to features, domain, product, owners, optional commercial links.
- **Feature:** deliverable under an initiative.
- **Requirement:** finest checkable work item under a feature (status, kanban).

**Typical flow:** demand or idea → initiative → features → requirements → status / timeline.

---

## 9. Roles (respect least privilege)

`SUPER_ADMIN`, `ADMIN`, `EDITOR`, `MARKETING`, `VIEWER`, `PENDING`.

- **PENDING:** not useful for API/MCP until promoted.
- **VIEWER:** mostly read; mutations may fail.
- **EDITOR / ADMIN / SUPER_ADMIN:** progressively more create/update/delete.
- **SUPER_ADMIN only** examples: promoting users, some shell/navigation settings (`/api/ui-settings`), destructive operations.

Never assume **SUPER_ADMIN** unless the connected identity is one.

---

## 10. Playbook — read what was asked, implement, update Tymio

1. Use **`tymio_get_agent_brief`** (remote MCP) or **`GET /api/ontology/brief`** (see **§5**) to see how capabilities map to routes, models, and MCP tools.
2. Use **`drd_meta`** or **`GET /meta`** for IDs and taxonomy (only after you are authenticated).
3. List and drill into **`drd_list_initiatives`**, **`drd_get_initiative`**, **`drd_list_features`**, **`drd_list_requirements`** (remote MCP or REST equivalents).
4. Read **notes** on initiatives/features when present (acceptance criteria, analysis).
5. After shipping, update requirement/initiative state with the appropriate **`drd_update_*`** tools or REST PATCHes.

---

## 11. Google Cloud Console (for operators)

For production at **tymio.app**, the OAuth web client should include:

- **Authorized JavaScript origins:** `https://tymio.app`
- **Authorized redirect URIs:**  
  - `https://tymio.app/api/auth/google/callback`  
  - `https://tymio.app/mcp-oauth/google/callback`

---

## 12. Checklist before closing an agent task

- [ ] Tymio initiative/feature/requirement IDs cited or updated if the task was tracked in the hub.
- [ ] If the **API surface** changed, **ontology** updated: admin **Refresh default bindings** / **Compile** where applicable, or manual capability/binding edits (see **§5**).
- [ ] No destructive demo seeds or unreviewed imports against **production**.
- [ ] If MCP/REST was unavailable, you stated that clearly and gave the user **UI + API_KEY + MCP** setup options — you did **not** claim tenant data was created without a successful authenticated call.

---

*Standalone handoff for agents; canonical product domain: **https://tymio.app**.*
