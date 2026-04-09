# Tymio workspace (agents)

Bundled with `@tymio/mcp-server` for MCP `instructions` when `TYMIO_MCP_PERSONA=workspace` (default hub behavior is unchanged; this block is optional context).

When working **in the Tymio monorepo**, the API is often `http://localhost:8080` and MCP at `http://localhost:8080/mcp`.

## Before any mutation

1. Confirm MCP is connected; if tools are missing or auth fails, do not claim hub data changed.
2. Almost all `/api/*` needs a session or `Authorization: Bearer` deployment key where enabled.
3. Prefer **`tymio_get_agent_brief`** (or `GET /api/ontology/brief`) before assuming which routes or tools exist.

## Connect

- **Remote MCP:** `POST https://tymio.app/mcp` (or your host) with OAuth — no per-user MCP API key in Tymio Settings.
- **Stdio:** `tymio-mcp login` then run `tymio-mcp` without `DRD_API_KEY`/`API_KEY` for the full proxied tool list. With those env vars set, only a REST subset is available.

## Vocabulary

| In conversation | In Tymio |
|-----------------|----------|
| App / application (surface) | Usually **Product** (line / asset) |
| Tenant / customer org | **Workspace** |
| “Capability” in ontology | Product **affordance** (routes, tools, models) — **not** a backlog row |

**Flow:** demand/idea → **Initiative** → **Features** → **Requirements** (with domain/product from meta).

## Hub ontology (two layers)

1. **Backlog graph:** Domain → Initiative → Feature → Requirement; demands link to initiatives/features; **dependencies** are initiative→initiative in the default model.
2. **Capability brief:** `tymio_get_agent_brief`, `tymio_list_capabilities` — what the product exposes.

Use **`drd_meta`** then list/get tools for live tenant data. Full Mermaid + tables live in the monorepo: `.cursor/skills/tymio-workspace/references/tymio-hub-ontology.md`.

## Roles

`VIEWER`, `EDITOR`, `ADMIN`, `SUPER_ADMIN` — assume least privilege.

## Personas

PM / PO / DEV prompts: `tymio-mcp persona pm|po|dev` or set `TYMIO_MCP_PERSONA`. Role matrix: `docs/TYMIO_AGENT_ROLES_PM_PO_DEV.md` in the monorepo.
