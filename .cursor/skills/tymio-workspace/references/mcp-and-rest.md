# Tymio — MCP, REST, and tool surface

Replace `https://tymio.app` with your deployment origin if not using production.

**Autonomous agents:** Tymio does **not** offer a per-user MCP API key in **Settings**, **Profile**, or **Account**. Do not instruct users to copy one. Use **OAuth** (remote **`/mcp`** or **`/t/<workspace-slug>/mcp`** in the IDE) or **`@tymio/mcp-server`** + **`tymio-mcp login`** for stdio (default; **`TYMIO_MCP_URL`** may point at either MCP path). **`DRD_API_KEY` / `API_KEY`** on stdio = **server `API_KEY`** (operator secret). Canonical Markdown: **`mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md`**, **`GET …/api/mcp/agent-context`** → `tymioMcpCliAgentGuidanceMarkdown`, `tymioMcpNoUserSettingsApiKey`.

## Local development (this monorepo)

| Purpose | URL |
|--------|-----|
| API + MCP (typical dev) | `http://localhost:8080` |
| MCP (Streamable HTTP) | `POST http://localhost:8080/mcp` or `POST http://localhost:8080/t/<workspace-slug>/mcp` |
| Workspace-plane REST (browser) | `http://localhost:8080/t/<workspace-slug>/api/...` (Vite proxies **`/t`** to the server in dev) |

**Cursor example** (local + deployed) from `docs/HUB.md`:

```json
{
  "mcpServers": {
    "tymio-local": { "url": "http://localhost:8080/mcp" },
    "tymio": { "url": "https://tymio.app/mcp" },
    "tymio-acme": { "url": "https://tymio.app/t/acme/mcp" }
  }
}
```

## Production-style endpoints

| Purpose | URL |
|--------|-----|
| Web app | `https://tymio.app` |
| REST API (legacy / scripts) | `https://tymio.app/api` |
| REST (hub under `/t/...`) | `https://tymio.app/t/<workspace-slug>/api/...` |
| Health | `GET https://tymio.app/api/health` |
| MCP (Streamable HTTP) | `POST https://tymio.app/mcp` or `POST https://tymio.app/t/<workspace-slug>/mcp` |
| OAuth protected-resource (MCP discovery) | `GET https://tymio.app/.well-known/oauth-protected-resource/mcp` |
| Public agent context (JSON) | `GET https://tymio.app/api/mcp/agent-context` |
| LLM-oriented site summary | `https://tymio.app/llms.txt` |
| Coding playbook (Markdown, **authenticated**) | `GET https://tymio.app/api/agent/coding-guide` |

**Google OAuth redirect URIs (operators):**  
`https://tymio.app/api/auth/google/callback` (browser),  
`https://tymio.app/mcp-oauth/google/callback` (remote MCP).

## Remote MCP config example (Cursor-style)

```json
{
  "mcpServers": {
    "tymio": {
      "url": "https://tymio.app/mcp"
    },
    "tymio-acme": {
      "url": "https://tymio.app/t/acme/mcp"
    }
  }
}
```

## Ontology / playbook tools (`tymio_*`)

- `tymio_get_coding_agent_guide` — full server coding-agent Markdown (may reference repo paths; prefer this skill + brief for portable use).
- `tymio_get_agent_brief` — compiled capability brief.
- `tymio_list_capabilities`, `tymio_get_capability` — capability map.

## Workspace atlas tools (`tymio_*`, full MCP only)

**Compiled backlog graph** (domains, products, initiatives, features, requirements) as JSON — not RAG, not a substitute for the capability brief. Requires **`workspaceSlug`** = MCP session workspace (from **`/t/<slug>/mcp`** or active workspace on **`/mcp`**).

- `tymio_get_workspace_atlas` — compact indices; **`not_built`** until first compile or **`tymio_rebuild_workspace_atlas`**.
- `tymio_search_workspace_objects` — keyword substring over titles.
- `tymio_get_workspace_object` — one shard by type + id.
- `tymio_explain_workspace_object` — optional LLM narrative when server env enables it.
- `tymio_rebuild_workspace_atlas` — EDITOR+; full recompile from DB.

**Not** in API-key stdio (`mcp/src/apiKeyStdio.ts`). Wiki: production **`/wiki/workspace-atlas`** or repo **`client/public/wiki/articles/workspace-atlas.md`**.

## Common `drd_*` tools (remote MCP)

**Meta:** `drd_health`, `drd_meta`

**Initiatives:** `drd_list_initiatives`, `drd_get_initiative`, `drd_create_initiative`, `drd_update_initiative`, `drd_delete_initiative`

**Taxonomy:** `drd_list_domains`, `drd_list_products`, `drd_create_product`, `drd_update_product`, `drd_get_product_tree`, `drd_list_personas`, `drd_list_accounts`, `drd_list_partners`, `drd_list_kpis`, `drd_list_milestones`, `drd_list_demands`, `drd_list_revenue_streams`

**Work items:** `drd_list_features`, `drd_create_feature`, `drd_update_feature`, `drd_list_requirements`, `drd_create_requirement`, `drd_update_requirement`, `drd_upsert_requirement`

**Other:** `drd_list_decisions`, `drd_list_risks`, `drd_list_dependencies`, `drd_list_assignments`, `drd_list_stakeholders`, `drd_timeline_calendar`, `drd_timeline_gantt`, plus campaigns/assets tools if enabled for the role.

Exact names may evolve; use `tymio_get_agent_brief` or `drd_meta` on the live server when in doubt.

## Stdio MCP subset

When using a stdio bridge with `DRD_API_BASE_URL` + `DRD_API_KEY`, expect **only** a subset (no `drd_create_product` in typical setups). Use **remote MCP** or REST `POST /api/products` to create products from automation. **Workspace atlas tools are omitted** from this subset — use OAuth stdio or remote MCP for those.

## Ontology REST (authenticated)

Base: `https://tymio.app/api/ontology` — e.g. `GET /capabilities`, `GET /brief?format=md&mode=compact`. Admin routes manage compile/export.

**Backlog entity graph** (Domain → Initiative → Feature → Requirement, demands, initiative-only dependencies): see [tymio-hub-ontology.md](tymio-hub-ontology.md) in this folder — use it alongside the brief so agents do not confuse **Capability** (affordance) with backlog rows.

## If the user cannot connect

1. Use the **web UI** (Admin/Editor as appropriate).
2. **REST** with exported `API_KEY` where available.
3. **Remote MCP** with OAuth at `https://tymio.app/mcp` or `https://tymio.app/t/<workspace-slug>/mcp`.
