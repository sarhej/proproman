---
name: tymio-workspace
description: >-
  Works with Tymio (tymio.app) via MCP or REST — connect, authenticate (OAuth
  first; never assume an authenticated session), map everyday language to hub
  entities (Product, Initiative, Feature, Requirement), use ontology briefs,
  the backlog entity graph, and backlog tools safely. Use when the user mentions
  Tymio, tymio.app, tymio_* MCP tools, workspace hub,
  initiatives, roadmap MCP, OAuth / mcp_auth for Tymio, tymio-mcp login,
  multiple workspaces / tenants / switching workspace, or connecting an AI agent
  to their product hub.
metadata:
  vendor: tymio
  homepage: https://tymio.app
  public_context: https://tymio.app/llms.txt
compatibility: >-
  Requires a Tymio account, network access to the Tymio host, and either (a) an
  MCP client with remote URL support and OAuth, or (b) REST with Bearer API_KEY
  where the deployment exposes it. There is no per-user MCP API key in Tymio
  Settings; API_KEY is a server operator secret. Tool names and subsets depend
  on remote vs stdio MCP — see references/mcp-and-rest.md and repo
  mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md.
---

# Tymio workspace (agents)

## OAuth and session — do this before any hub tool

**Rule:** Complete **OAuth** first. **`POST https://<host>/mcp`** (root) is **discovery-only**: it exposes **`tymio_list_my_workspaces`** and **`tymio_mcp_routing_guide`** only — **no tenant**, **no** backlog CRUD, **no** workspace atlas / brief tools. All backlog and workspace-scoped **`tymio_*`** tools require **`POST https://<host>/t/<workspace-slug>/mcp`**. Do not claim hub rows changed unless calls hit a **pinned** workspace MCP URL (or REST) and succeed.

### 1. Detect unauthenticated or disconnected state

Treat any of these as **blocked on auth** — stop and fix auth before backlog work:

- MCP descriptors list **only** `mcp_auth` (or the client says the server needs authentication).
- Hub tools are missing from the tool list while other servers show tools.
- Calls return **401**, **403**, “not authenticated,” “sign in,” or connection errors.

### 2. Initiate OAuth (pick what your client actually exposes)

- **`https://tymio.app/mcp`** — Valid for **OAuth + discovery** only. After sign-in, the client sees **two** tools; use **`tymio_list_my_workspaces`** to get each **`…/t/<slug>/mcp`** URL, then **add or switch** the MCP **Server URL** to that pinned URL for backlog work.
- **`https://tymio.app/t/<workspace-slug>/mcp`** — **Workspace MCP** (full backlog CRUD, atlas, and capability **`tymio_*`** tools). Same OAuth flow; slug is in the path.

**Server URL hygiene:** No **trailing spaces** after the path (e.g. `…/mcp ` breaks matching).

| Setup | What you (the agent) do |
|--------|-------------------------|
| **Cursor / IDE shows `mcp_auth` for the Tymio server** | Call **`mcp_auth` with `{}`** once (per server instructions). Do **not** skip this to “try a tool first.” Wait for the user to finish the browser flow if the client opens one. |
| **Remote Streamable HTTP** | Prefer **`…/t/<slug>/mcp`** for any server meant to edit backlog. Root **`…/mcp`** is fine for a **separate** “Tymio discovery” entry if the user wants OAuth then copy workspace URLs. |
| **Stdio `@tymio/mcp-server`** | For full tools, set **`TYMIO_MCP_URL`** / **`tymio-mcp login`** to **`…/t/<slug>/mcp`**. Root **`…/mcp`** only proxies the two discovery tools unless the user changes URL. Ensure **`TYMIO_API_KEY` / `API_KEY` are unset** (legacy **`DRD_API_KEY`** unset) for OAuth proxy mode. |

### 3. Verify after OAuth

- If the tool list has **only** `tymio_list_my_workspaces` / `tymio_mcp_routing_guide`, you are on **root `/mcp`** — call **`tymio_list_my_workspaces`**, then **`tymio_mcp_routing_guide`** for templates; **create or explain** **`.cursor/mcp.json`** / **`.mcp.json`** (or point Cursor / stdio at **`…/t/<slug>/mcp`**) before calling backlog tools or **`tymio_get_agent_brief`**.
- On **`…/t/<slug>/mcp`**, verify with **`tymio_health`** and/or **`tymio_get_agent_brief`**, then **`tymio_meta`**, lists, creates.

### 4. What to say to the user when blocked

Be explicit, not vague: e.g. “Tymio MCP is not authenticated in this session. Please complete sign-in for the Tymio MCP server (or run `tymio-mcp login` for stdio). After that, ask me to retry starting with `tymio_health`.” Do **not** imply the hub was updated when you never got a 200 from an authenticated call.

---

## One user, many workspaces — never mix tenants

**How Tymio works:** One **Google user** can be a member of **many Workspaces** (e.g. a “Tymio” org workspace, **Soma**, etc.). That is normal. There is **no** “second account” for a second workspace.

**What actually confuses agents:** Not identities — it is **where this MCP connection is scoped**. Each MCP server configuration has **one workspace context per connection**. Tools run in **that** tenant until the user changes the MCP **URL** or uses a **different** MCP server entry.

**Data rule:** Each workspace is its own **tenant**: separate domains, products, initiatives, features, requirements, and **numeric IDs**. Rows in workspace A do not exist in B; **IDs are not portable** across workspaces.

### How Streamable HTTP MCP picks the workspace

| MCP `url` | What it means |
|-----------|----------------|
| **`https://<host>/mcp`** | **Discovery only** — no workspace; lists memberships + routing help. |
| **`https://<host>/t/<workspace-slug>/mcp`** | **Workspace MCP** — all backlog + workspace **`tymio_*`** tools; **`workspaceSlug`** on calls must match this slug. |

**Same Google user, many workspaces:** Use **`tymio_list_my_workspaces`** on root `/mcp` (or the web app) to see slugs. Add **one MCP server per workspace** you automate (each `…/t/<slug>/mcp`) or change Server URL + re-auth when switching orgs.

### Practical setup (tell users this)

1. **Backlog / PM / PO work:** MCP **Server URL** = **`https://tymio.app/t/<slug>/mcp`** (trimmed).
2. **Optional discovery entry:** Root **`…/mcp`** for OAuth + **`tymio_list_my_workspaces`** to discover slugs, then configure a second entry with **`…/t/<slug>/mcp`**.
3. **Stdio:** Set **`TYMIO_MCP_URL`** to **`…/t/<slug>/mcp`** for full tools.

### Per-project MCP file (agents: create or explain)

When the user is on **root `…/mcp`** (only **`tymio_list_my_workspaces`** + **`tymio_mcp_routing_guide`**), **do not** stop at “switch the URL in Settings” — **create or explain** a **repo-local** config so the next session uses the right workspace by default:

1. Call **`tymio_list_my_workspaces`**, pick the **slug** for this repository or org.
2. **Cursor:** create or update **`.cursor/mcp.json`** at the repo root with an entry whose **`url`** is **`https://<host>/t/<slug>/mcp`** (use the deployment origin, not only `tymio.app` when self-hosted). Optional second entry **`tymio-discovery`** → **`…/mcp`** for listing workspaces.
3. **Claude Code:** create or update **`.mcp.json`** at the repo root with the same **`mcpServers`** → **`url`** pattern.
4. Tell the user to **restart Cursor** / restart the CLI session and **re-auth** if prompted; then verify **`tymio_health`** on the **workspace** connection.

**Canonical copy-paste templates** are returned by the MCP tool **`tymio_mcp_routing_guide`** (same host as the discovery connection). Prefer that tool’s output over paraphrasing so URLs match the deployment.

### What agents must do (anti-mixing rules)

1. If you only see **two** tools (discovery) and no backlog CRUD, say clearly: user is on **root `/mcp`** — they must add **`…/t/<slug>/mcp`** for the target org.
2. **State the workspace** (slug) when reporting hub actions.
3. **Never reuse IDs** across workspaces.
4. **Two workspaces in one thread:** use **two** MCP servers or **two** sequential URLs — never interleave tenants on one pinned connection.

### Cursor — common mistakes

- **Expecting `tymio_meta` on root `/mcp`:** Wrong endpoint — use **`…/t/<slug>/mcp`**.
- **Stale OAuth after changing Server URL:** disconnect, set exact URL, re-auth.
- **Trailing space** in Server URL.
- **Two entries, wrong one active** for this chat.

---

## This monorepo (local development)

When working **in this repository**, the API/MCP server is usually **`http://localhost:8080`** (see `docs/HUB.md`). Use MCP URL **`http://localhost:8080/mcp`** or **`http://localhost:8080/t/<workspace-slug>/mcp`** in Cursor (e.g. server name `tymio-local` alongside production `tymio`).

**Tenant context:** **`POST /mcp`** has **no** tenant (discovery tools only). **`POST /t/<slug>/mcp`** runs **`runWithTenant`** for that slug. REST: **`API_KEY`** + **`X-Tenant-Id`** or **`/t/slug/api/...`** — see `docs/HUB.md` §1.2 and §6.

## Before any mutation

1. **Workspace gate:** Confirm MCP **Server URL** is **`…/t/<that-slug>/mcp`** (not root **`…/mcp`**). See **[One user, many workspaces](#one-user-many-workspaces--never-mix-tenants)**.
2. **OAuth gate:** Follow the section **OAuth and session — do this before any hub tool** at the top of this skill — `mcp_auth` or IDE sign-in / `tymio-mcp login`, then **`tymio_health` or `tymio_get_agent_brief`** to verify.
3. **Confirm you are actually connected.** MCP tools (`tymio_*`) exist only if the runtime has a working Tymio MCP config. If tools are missing or calls fail with auth/connection errors, **do not** claim data changed — tell the user to fix MCP or use REST with a key.
4. **Auth:** Almost all **`/api/*`** and **`/t/<workspace-slug>/api/*`** return **401** without a session cookie or `Authorization: Bearer <API_KEY>` (when the deployment has `API_KEY`). There is no anonymous tenant API.
5. **Prefer live briefs over assumptions:** Call `tymio_get_agent_brief` (MCP) or authenticated `GET /api/ontology/brief` before planning work that depends on what the hub already exposes.

## Connect (typical)

- **Remote MCP:** `POST https://tymio.app/mcp` = **discovery only** (two tools). `POST https://tymio.app/t/<workspace-slug>/mcp` = **full** workspace MCP. OAuth in browser; **no** per-user API key in the Tymio UI.
- **REST / scripts:** Bases `https://tymio.app/api` and `https://tymio.app/t/<workspace-slug>/api` with Bearer token (deployment **`API_KEY`**) or browser session — that key is **not** exposed in user Settings.
- **Stdio npm package (`@tymio/mcp-server`):** Published at [npmjs.com/package/@tymio/mcp-server](https://www.npmjs.com/package/@tymio/mcp-server). OAuth proxy: set **`TYMIO_MCP_URL`** to **`…/t/<slug>/mcp`** for full tools; default **`…/mcp`** only exposes discovery tools. If `DRD_API_KEY`/`API_KEY` is set on the process, you get the **REST subset** only. **Never** tell users to “get MCP API key from Settings” — it does not exist. Full Markdown: [mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md](../../../mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md) (repo), `tymio-mcp instructions`, or `GET …/api/mcp/agent-context` → `tymioMcpCliAgentGuidanceMarkdown`. In the **tymio** hub workspace, CLI/npm backlog is tracked under Product **CLI-NPM** (`cli-npm`), separate from **Tymio Web App**.

Public, unauthenticated pointers: `https://tymio.app/llms.txt`, `GET https://tymio.app/api/mcp/agent-context` (JSON, includes CLI guide + `tymioMcpNoUserSettingsApiKey: true`).

## Vocabulary (do not confuse)

| Say this in conversation | Means in Tymio |
|--------------------------|----------------|
| “Application” / “app” (surface) | Usually **Product** (product line / asset), not a separate Application entity |
| SaaS “tenant” / customer org | **Workspace** — one user can have **many**; each has its own backlog and **IDs** (do not mix; see [One user, many workspaces](#one-user-many-workspaces--never-mix-tenants)) |
| “Capability” in ontology docs | Named hub affordance with bindings (routes, MCP tools, models) — **not** a backlog row |

**Flow:** idea/demand → **Initiative** → **Features** → **Requirements** (with domain/product taxonomy from meta).

## Hub ontology (required background)

Agents work better when they separate **two** notions:

1. **Backlog ontology** — the **work graph** (Domain, Product, Initiative, Feature, Requirement, Demands, etc.). Wrong layer = wrong `tymio_*` calls (e.g. treating a hub **Capability** as a **Feature** row).
2. **Capability ontology** — what the **product** exposes (`tymio_get_agent_brief`, `tymio_list_capabilities`, `/api/ontology/brief`). Answers “what routes/tools exist?” not “what Jira-style rows exist?”.

**Read and follow:** [references/tymio-hub-ontology.md](references/tymio-hub-ontology.md) (Mermaid graphs, parent/child rules, initiative-only dependencies). Re-open it when relationships are ambiguous.

## Workflow checklist

1. **Workspace** — MCP URL must be **`…/t/<slug>/mcp`** for backlog; root **`…/mcp`** is discovery only. See [One user, many workspaces](#one-user-many-workspaces--never-mix-tenants).
2. **Ontology graph** — skim or apply [tymio-hub-ontology.md](references/tymio-hub-ontology.md) so drill-down order and entity types match the hub.
3. `tymio_get_agent_brief` or ontology brief — align plan with real routes/tools (capability layer).
4. **Optional (full MCP only):** `tymio_get_workspace_atlas` → `tymio_search_workspace_objects` → `tymio_get_workspace_object` for a token-efficient backlog overview; if `not_built`, use `tymio_rebuild_workspace_atlas` (EDITOR+) or wait for debounced rebuild. See [wiki workspace-atlas](https://tymio.app/wiki/workspace-atlas) or repo `client/public/wiki/articles/workspace-atlas.md`. **Not** available in API-key stdio mode.
5. `tymio_meta` or `GET /meta` — resolve `domainId`, `productId`, etc., after auth (tenant-scoped — same IDs are invalid in another workspace).
6. List/update work: `tymio_list_initiatives`, `tymio_get_initiative`, `tymio_list_features`, `tymio_list_requirements`, and matching `tymio_update_*` or REST PATCH.
7. After shipping product/API changes that affect agents, remind admins to refresh ontology bindings and recompile briefs when applicable.

## Roles

Respect least privilege (lowest to highest): `VIEWER`, `EDITOR`, `ADMIN`, `SUPER_ADMIN`. Do not assume elevated rights.

## Deeper reference

- Backlog vs capability ontology (graphs): [references/tymio-hub-ontology.md](references/tymio-hub-ontology.md)
- URLs, OAuth callbacks, tool inventory, stdio subset: [references/mcp-and-rest.md](references/mcp-and-rest.md)
- Persona-specific agent skills (PM / PO / DEV) and capability matrix: [docs/TYMIO_AGENT_ROLES_PM_PO_DEV.md](../../../docs/TYMIO_AGENT_ROLES_PM_PO_DEV.md)
