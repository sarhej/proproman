---
name: tymio-workspace
description: >-
  Works with Tymio (tymio.app) via MCP or REST — connect, authenticate, map
  everyday language to hub entities (Product, Initiative, Feature, Requirement),
  use ontology briefs and backlog tools safely. Use when the user mentions Tymio,
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

When working **in this repository**, the API/MCP server is usually **`http://localhost:8080`** (see `docs/HUB.md`). Use MCP URL **`http://localhost:8080/mcp`** in Cursor (e.g. server name `tymio-local` alongside production `tymio`).

**Tenant context:** Remote MCP (OAuth on `/mcp`) may not attach the same tenant scoping as API-key flows; prefer **`API_KEY` + `activeTenantId`** for scripted access when strict tenant isolation matters — see `docs/HUB.md` §6.

## Before any mutation

1. **Confirm you are actually connected.** MCP tools (`drd_*`, `tymio_*`) exist only if the runtime has a working Tymio MCP config. If tools are missing or calls fail with auth/connection errors, **do not** claim data changed — tell the user to fix MCP or use REST with a key.
2. **Auth:** Almost all `/api/*` returns **401** without a session cookie or `Authorization: Bearer <API_KEY>` (when the deployment has `API_KEY`). There is no anonymous tenant API.
3. **Prefer live briefs over assumptions:** Call `tymio_get_agent_brief` (MCP) or authenticated `GET /api/ontology/brief` before planning work that depends on what the hub already exposes.

## Connect (typical)

- **Remote MCP (recommended):** `POST https://tymio.app/mcp` (replace host if self-hosted). OAuth in browser; **no** API key for users to copy from the Tymio UI. Same identity and roles as the signed-in user.
- **REST / scripts:** Base `https://tymio.app/api` with Bearer token (deployment **`API_KEY`**) or browser session — that key is **not** exposed in user Settings.
- **Stdio npm package (`@tymio/mcp-server`):** Default = OAuth proxy to hosted `/mcp` after **`tymio-mcp login`** (full tools). If `DRD_API_KEY`/`API_KEY` is set on the process, you get the **REST subset** only. **Never** tell users to “get MCP API key from Settings” — it does not exist. Full Markdown: [mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md](../../../mcp/TYMIO_MCP_CLI_AGENT_GUIDANCE.md) (repo), `tymio-mcp instructions`, or `GET …/api/mcp/agent-context` → `tymioMcpCliAgentGuidanceMarkdown`.

Public, unauthenticated pointers: `https://tymio.app/llms.txt`, `GET https://tymio.app/api/mcp/agent-context` (JSON, includes CLI guide + `tymioMcpNoUserSettingsApiKey: true`).

## Vocabulary (do not confuse)

| Say this in conversation | Means in Tymio |
|--------------------------|----------------|
| “Application” / “app” (surface) | Usually **Product** (product line / asset), not a separate Application entity |
| SaaS “tenant” / customer org | **Workspace** / tenant context — not the same as Product |
| “Capability” in ontology docs | Named hub affordance with bindings (routes, MCP tools, models) — **not** a backlog row |

**Flow:** idea/demand → **Initiative** → **Features** → **Requirements** (with domain/product taxonomy from meta).

## Workflow checklist

1. `tymio_get_agent_brief` or ontology brief — align plan with real routes/tools.
2. `drd_meta` or `GET /meta` — resolve `domainId`, `productId`, etc., after auth.
3. List/update work: `drd_list_initiatives`, `drd_get_initiative`, `drd_list_features`, `drd_list_requirements`, and matching `drd_update_*` or REST PATCH.
4. After shipping product/API changes that affect agents, remind admins to refresh ontology bindings and recompile briefs when applicable.

## Roles

Respect least privilege: `VIEWER` < `EDITOR` < `ADMIN` < `SUPER_ADMIN`. Do not assume elevated rights.

## Deeper reference

- URLs, OAuth callbacks, tool inventory, stdio subset: [references/mcp-and-rest.md](references/mcp-and-rest.md)
