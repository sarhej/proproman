# Changelog

## 2.4.2

- **`tymio-mcp bootstrap`** — when **`--slug`** or **`TYMIO_WORKSPACE_SLUG` is set, requires OAuth (auto-runs **`tymio-mcp login`** if no cached tokens) and verifies ACTIVE workspace membership via **`tymio_list_my_workspaces`** before writing a workspace MCP URL. Refuses to pin a slug the signed-in user cannot access. **`--login`** forces re-sign-in (account switch: **`tymio-mcp logout`** then **`bootstrap --login`**).
- **Tests:** bootstrap auth gate, membership verification, MCP **`list_my_workspaces`** client helper.

## 2.4.1

- **`tymio-mcp login`** — optional **`TYMIO_OAUTH_LOGIN_TIMEOUT_MS`** (positive milliseconds) caps how long the CLI waits for the OAuth redirect (avoids hanging forever if the user abandons the browser flow).
- **Tests:** workspace MCP **403** when the tenant slug does not exist; **`tymio_get_product_tree`** rejects unknown **`productId`**.

## 2.4.0

- **`tymio-mcp bootstrap`** — full non-destructive merge for **Cursor** (`mcp.json`), **Claude Code** (`settings.json`), **OpenCode** (`opencode.json`), **Codex** (`config.toml` `[mcp_servers.tymio]`). Flags: `--client`, `--slug`, `--scope`, `--force`, `--dry-run`, `--login`, `--skills`. Auto-detects installed clients; backs up before writes. See repo **`docs/TYMIO_BOOTSTRAP.md`**.
- **`tymio-mcp skill`** — **`skill update <id>`** / **`skill update --all`** and **`skill remove <id>`** (with backups when replacing), aligned with hub skill distribution.

## 2.3.0

- **`tymio-mcp skill`** — `skill list` / `skill show <id>` / `skill install <id> [--client …] [--scope …] [--dry-run]` against public hub **`GET /skills/*`** (uses `TYMIO_API_BASE_URL` or infers origin from `TYMIO_MCP_URL`). Install writes the file with a **`.tymio-bak-<timestamp>`** backup when replacing.
- **Hub alignment:** complements server **`tymio_list_skills`** / **`tymio_install_skill`** MCP tools and **`/.well-known/opencode`** (OpenCode remote defaults).

## 2.2.0

- **`tymio-mcp doctor`** — prints CLI version, Node version, OAuth file presence under the Tymio config dir, and masked env hints (`TYMIO_MCP_URL`, workspace slug, API key presence). Writes to stderr (same as `help` / `instructions`).
- **`tymio-mcp bootstrap`** — preview only: `--help` documents the upcoming non-destructive client merge; full implementation tracked in repo `docs/TYMIO_BOOTSTRAP.md` and phase status in `docs/TYMIO_IMPLEMENTATION_STATUS.md`.

## 2.1.0

### Breaking (hub + CLI must deploy together)

- **MCP tool names:** all former `drd_*` tools are now `tymio_*` (see `docs/TYMIO_MCP_RENAME.md`). Examples: `tymio_health`, `tymio_meta`, `tymio_list_initiatives`, `tymio_create_product`. Special case: `drd_set_dr_hub_epic_implementation_notes` → `tymio_set_epic_implementation_notes`.
- **Deploy order:** ship the **hub** (server) exposing the new tool names first, then publish this CLI version. Remote MCP and OAuth stdio proxy the hub’s tool list verbatim.

### Non-breaking (migration helpers)

- **Env vars:** prefer `TYMIO_API_KEY`, `TYMIO_API_BASE_URL`, `TYMIO_WORKSPACE_SLUG`. Legacy `DRD_API_KEY`, `DRD_API_BASE_URL`, and `DRD_WORKSPACE_SLUG` still work; the CLI prints a **one-time stderr deprecation** when a legacy name is used without the `TYMIO_*` counterpart.
- **JS API:** `tymioFetch` / `tymioFetchText` replace `drdFetch` / `drdFetchText`; deprecated aliases remain for one release.

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
