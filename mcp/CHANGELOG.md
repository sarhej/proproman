# Changelog

## 2.0.1

- **OAuth login** — authorization error responses from the local callback server are **plain text** (simpler than HTML error pages).
- **Documentation** — agent guidance, README, and CLI hints clarify **`/mcp`** vs **`/t/<workspace-slug>/mcp`** for **`TYMIO_MCP_URL`** / **`tymio-mcp login`**.
- **npm metadata** — additional **keywords** (`openclaw`, `product-management`, `roadmap`, `backlog`, `planning`) for discoverability.

## 2.0.0

### Breaking

- **Pinned workspace for stdio** — `tymio-mcp` (OAuth proxy and API-key bridge) **requires** `TYMIO_WORKSPACE_SLUG` or `DRD_WORKSPACE_SLUG` (the hub workspace slug this process is bound to). Every tool call must include **`workspaceSlug`** matching that pin (case-insensitive). Prevents agents from targeting another workspace for the same user.
- **Tests / local tooling only** — set `TYMIO_MCP_SKIP_WORKSPACE_PINNING=1` to skip the startup requirement (do not use in production agent configs).

### Added / changed

- **API-key stdio** — Resolves the pinned slug to a tenant via `GET /api/me/tenants` and sends **`X-Tenant-Id`** on all hub REST calls; tool payloads still carry `workspaceSlug` for consistency but must match the pin.
- **OAuth stdio (hub proxy)** — Asserts tool arguments match the pinned slug before `callTool` to the hosted MCP.
- **Hub (server) MCP** — Stricter `workspaceSlug` validation (length, `^[a-z0-9-]+$`) and **case-insensitive** match to the session workspace; API-key sessions can use tenant-list routes needed for resolution (`authViaApiKey` + `requireSession` behavior).

### Requires

- **Deploy hub** with the matching server changes **before or with** rolling out this CLI to users who rely on API-key stdio or the updated MCP slug rules.

## 1.1.0

- **Bundled agent personas** (`personas/*.md`): `workspace`, `pm`, `po`, `dev` — aligned with Tymio hub roles; shipped in the npm tarball.
- **`tymio-mcp persona list`** and **`tymio-mcp persona <id>`** — print persona Markdown to stdout (or list ids).
- **`TYMIO_MCP_PERSONA`** — optional env on the stdio process; appends the selected persona to MCP server **`instructions`** after the main agent guide (`hub` aliases `workspace`). Invalid values log a stderr warning and fall back to the base guide only.
- **Startup stderr hint** — when a valid persona is set, reminds that instructions include it and how to print the prompt (`tymio-mcp persona <id>`).
- **Agent guidance** — `TYMIO_MCP_CLI_AGENT_GUIDANCE.md` updated with persona usage; `README.md` and help text document commands and env.

## 1.0.1

Prior release (OAuth proxy, API-key REST subset, `tymio-mcp instructions`, login/logout).
