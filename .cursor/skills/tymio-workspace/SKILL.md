---
name: tymio-workspace
description: >-
  Works with Tymio (tymio.app) via MCP or REST — connect, authenticate, map
  everyday language to hub entities (Product, Initiative, Feature, Requirement),
  use ontology briefs, the backlog entity graph, and backlog tools safely. Use when the user mentions Tymio,
  tymio.app, DRD tools, drd_* or tymio_* MCP tools, workspace hub, initiatives,
  roadmap MCP, or connecting an AI agent to their product hub.
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

## This monorepo (local development)

When working **in this repository**, the API/MCP server is usually **`http://localhost:8080`** (see `docs/HUB.md`). Use MCP URL **`http://localhost:8080/mcp`** or **`http://localhost:8080/t/<workspace-slug>/mcp`** in Cursor (e.g. server name `tymio-local` alongside production `tymio`).

**Tenant context:** After OAuth, MCP runs tools under **`runWithTenant`**: on **`/mcp`**, tenant comes from the user’s **active workspace** (and valid **`X-Tenant-Id`** when used); on **`/t/<slug>/mcp`**, tenant is **pinned by the URL**. For **REST** scripts without a session, **`API_KEY`** + **`X-Tenant-Id`** (or workspace-plane **`/t/slug/api/...`** with session) still applies — see `docs/HUB.md` §1.2 and §6.

## Before any mutation

1. **Confirm you are actually connected.** MCP tools (`drd_*`, `tymio_*`) exist only if the runtime has a working Tymio MCP config. If tools are missing or calls fail with auth/connection errors, **do not** claim data changed — tell the user to fix MCP or use REST with a key.
2. **Auth:** Almost all **`/api/*`** and **`/t/<workspace-slug>/api/*`** return **401** without a session cookie or `Authorization: Bearer <API_KEY>` (when the deployment has `API_KEY`). There is no anonymous tenant API.
3. **Prefer live briefs over assumptions:** Call `tymio_get_agent_brief` (MCP) or authenticated `GET /api/ontology/brief` before planning work that depends on what the hub already exposes.

## Connect (typical)

- **Remote MCP (recommended):** `POST https://tymio.app/mcp` or `POST https://tymio.app/t/<workspace-slug>/mcp` (replace host if self-hosted). OAuth in browser; **no** API key for users to copy from the Tymio UI. Same identity and roles as the signed-in user.
- **REST / scripts:** Bases `https://tymio.app/api` and `https://tymio.app/t/<workspace-slug>/api` with Bearer token (deployment **`API_KEY`**) or browser session — that key is **not** exposed in user Settings.
- **Stdio npm package (`@tymio/mcp-server`):** Default = OAuth proxy to hosted MCP (**`TYMIO_MCP_URL`**, default `…/mcp`; may be `…/t/<slug>/mcp`) after **`tymio-mcp login`** (full tools). If `DRD_API_KEY`/`API_KEY` is set on the process, you get the **REST subset** only. **Never** tell users to “get MCP API key from Settings” — it does not exist. Full Markdown: [mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md](../../../mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md) (repo), `tymio-mcp instructions`, or `GET …/api/mcp/agent-context` → `tymioMcpCliAgentGuidanceMarkdown`.

Public, unauthenticated pointers: `https://tymio.app/llms.txt`, `GET https://tymio.app/api/mcp/agent-context` (JSON, includes CLI guide + `tymioMcpNoUserSettingsApiKey: true`).

## Vocabulary (do not confuse)

| Say this in conversation | Means in Tymio |
|--------------------------|----------------|
| “Application” / “app” (surface) | Usually **Product** (product line / asset), not a separate Application entity |
| SaaS “tenant” / customer org | **Workspace** / tenant context — not the same as Product |
| “Capability” in ontology docs | Named hub affordance with bindings (routes, MCP tools, models) — **not** a backlog row |

**Flow:** idea/demand → **Initiative** → **Features** → **Requirements** (with domain/product taxonomy from meta).

## Hub ontology (required background)

Agents work better when they separate **two** notions:

1. **Backlog ontology** — the **work graph** (Domain, Product, Initiative, Feature, Requirement, Demands, etc.). Wrong layer = wrong `drd_*` calls (e.g. treating a hub **Capability** as a **Feature** row).
2. **Capability ontology** — what the **product** exposes (`tymio_get_agent_brief`, `tymio_list_capabilities`, `/api/ontology/brief`). Answers “what routes/tools exist?” not “what Jira-style rows exist?”.

**Read and follow:** [references/tymio-hub-ontology.md](references/tymio-hub-ontology.md) (Mermaid graphs, parent/child rules, initiative-only dependencies). Re-open it when relationships are ambiguous.

## Workflow checklist

1. **Ontology graph** — skim or apply [tymio-hub-ontology.md](references/tymio-hub-ontology.md) so drill-down order and entity types match the hub.
2. `tymio_get_agent_brief` or ontology brief — align plan with real routes/tools (capability layer).
3. **Optional (full MCP only):** `tymio_get_workspace_atlas` → `tymio_search_workspace_objects` → `tymio_get_workspace_object` for a token-efficient backlog overview; if `not_built`, use `tymio_rebuild_workspace_atlas` (EDITOR+) or wait for debounced rebuild. See [wiki workspace-atlas](https://tymio.app/wiki/workspace-atlas) or repo `client/public/wiki/articles/workspace-atlas.md`. **Not** available in API-key stdio mode.
4. `drd_meta` or `GET /meta` — resolve `domainId`, `productId`, etc., after auth.
5. List/update work: `drd_list_initiatives`, `drd_get_initiative`, `drd_list_features`, `drd_list_requirements`, and matching `drd_update_*` or REST PATCH.
6. After shipping product/API changes that affect agents, remind admins to refresh ontology bindings and recompile briefs when applicable.

## Roles

Respect least privilege (lowest to highest): `VIEWER`, `EDITOR`, `ADMIN`, `SUPER_ADMIN`. Do not assume elevated rights.

## Deeper reference

- Backlog vs capability ontology (graphs): [references/tymio-hub-ontology.md](references/tymio-hub-ontology.md)
- URLs, OAuth callbacks, tool inventory, stdio subset: [references/mcp-and-rest.md](references/mcp-and-rest.md)
- Persona-specific agent skills (PM / PO / DEV) and capability matrix: [docs/TYMIO_AGENT_ROLES_PM_PO_DEV.md](../../../docs/TYMIO_AGENT_ROLES_PM_PO_DEV.md)
