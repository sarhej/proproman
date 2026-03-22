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

If you are pointed at a **staging or custom host**, replace `https://tymio.app` with that origin everywhere; paths stay the same.

---

## 2. How to connect an agent

### 2.1 Remote MCP (recommended when the client supports HTTP MCP + OAuth)

- **Endpoint:** `POST https://tymio.app/mcp`
- **Auth:** OAuth 2.1 with Google, scoped for MCP (`mcp:tools`). Unauthenticated calls receive **401** with pointers to the metadata URL above; follow the client’s MCP OAuth flow (e.g. Cursor “URL” server config).
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

### 2.2 REST API (curl, scripts, or agents without MCP)

- **Base:** `https://tymio.app/api`
- **Auth:** Logged-in **session cookie** from the browser, or **`Authorization: Bearer <API_KEY>`** when the deployment has `API_KEY` configured (automation user; role is fixed server-side).

### 2.3 Local stdio MCP package (optional)

Some teams run a small **stdio** MCP process that proxies to the hub over REST. Point it at production by setting:

- `DRD_API_BASE_URL=https://tymio.app`
- `DRD_API_KEY=<same value as server API_KEY>`

That process exposes **only a subset** of tools (see section 4). For the **full** tool surface, use **remote** `POST https://tymio.app/mcp`.

---

## 3. MCP tool names (remote server at `/mcp`)

Tool names use a historical `drd_` prefix for backlog/data operations; `tymio_` prefix is used for ontology and this playbook.

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

## 4. Stdio MCP subset (when using `DRD_API_BASE_URL`)

If the client uses the **stdio** bridge against `https://tymio.app`, expect **only**:

`drd_health`, `drd_meta`, `drd_list_initiatives`, `drd_get_initiative`, `drd_create_initiative`, `drd_update_initiative`, `drd_delete_initiative`, `drd_list_domains`, `drd_list_products`, `drd_list_personas`, `drd_list_accounts`, `drd_list_partners`, `drd_list_kpis`, `drd_list_milestones`, `drd_list_demands`, `drd_list_revenue_streams`, `tymio_get_coding_agent_guide`, `tymio_get_agent_brief`, `tymio_list_capabilities`, `tymio_get_capability`.

For features, requirements, timeline, campaigns, etc., use **remote MCP** or **REST** (`/api/...`).

---

## 5. REST endpoints agents often need

All under `https://tymio.app/api` unless noted.

- `GET /meta` — domains, products, users, accounts, partners, personas, revenue streams.
- `GET|POST /initiatives`, `GET|PATCH|DELETE /initiatives/:id`, etc.
- `GET|POST /features`, `GET|PATCH|DELETE /features/:id`, etc.
- `GET|POST /requirements`, …
- Ontology (typically **admin** for mutating compile/refresh):  
  `GET /ontology/capabilities`, `GET /ontology/brief?format=md|json&mode=compact|full`,  
  `POST /ontology/compile`, `POST /ontology/refresh-bindings`, `POST /ontology/export-file`  
  (exact auth: follow response codes if you are not admin).

Use **GET** `/agent/coding-guide` with the same auth as above for the playbook as raw Markdown.

---

## 6. Mental model (minimum vocabulary)

- **Domain** (pillar): strategic grouping for initiatives on boards.
- **Product:** product line / asset — groups initiatives (not a SaaS tenant).
- **Initiative:** roadmap item (often epic-level); links to features, domain, product, owners, optional commercial links.
- **Feature:** deliverable under an initiative.
- **Requirement:** finest checkable work item under a feature (status, kanban).

**Typical flow:** demand or idea → initiative → features → requirements → status / timeline.

---

## 7. Roles (respect least privilege)

`SUPER_ADMIN`, `ADMIN`, `EDITOR`, `MARKETING`, `VIEWER`, `PENDING`.

- **PENDING:** not useful for API/MCP until promoted.
- **VIEWER:** mostly read; mutations may fail.
- **EDITOR / ADMIN / SUPER_ADMIN:** progressively more create/update/delete.
- **SUPER_ADMIN only** examples: promoting users, some shell/navigation settings (`/api/ui-settings`), destructive operations.

Never assume **SUPER_ADMIN** unless the connected identity is one.

---

## 8. Playbook — read what was asked, implement, update Tymio

1. Use **`tymio_get_agent_brief`** (remote MCP) or **`GET /ontology/brief`** to see how capabilities map to routes and tools.
2. Use **`drd_meta`** or **`GET /meta`** for IDs and taxonomy.
3. List and drill into **`drd_list_initiatives`**, **`drd_get_initiative`**, **`drd_list_features`**, **`drd_list_requirements`** (remote MCP or REST equivalents).
4. Read **notes** on initiatives/features when present (acceptance criteria, analysis).
5. After shipping, update requirement/initiative state with the appropriate **`drd_update_*`** tools or REST PATCHes.

---

## 9. Google Cloud Console (for operators)

For production at **tymio.app**, the OAuth web client should include:

- **Authorized JavaScript origins:** `https://tymio.app`
- **Authorized redirect URIs:**  
  - `https://tymio.app/api/auth/google/callback`  
  - `https://tymio.app/mcp-oauth/google/callback`

---

## 10. Checklist before closing an agent task

- [ ] Tymio initiative/feature/requirement IDs cited or updated if the task was tracked in the hub.
- [ ] If the **API surface** changed, ontology/brief refreshed or updated in Admin (human step).
- [ ] No destructive demo seeds or unreviewed imports against **production**.

---

*Standalone handoff for agents; canonical product domain: **https://tymio.app**.*
