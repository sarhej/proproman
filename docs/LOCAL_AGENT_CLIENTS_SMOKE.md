# Local agent-client smoke (Cursor, Claude Code, Codex)

This repo ships a **non-destructive** shell script that:

1. Builds `mcp/dist` if needed and runs **`tymio-mcp doctor`**.
2. For each supported client, runs **`tymio-mcp bootstrap`** in a **temporary directory** with a fake project layout (or isolated `HOME` for Codex) so your real `~/.cursor`, `~/.mcp.json`, and `~/.codex` are never touched in the default/dry-run path.
3. Optionally (**`WRITE=1`**) writes the same bootstrap output into those temp dirs only, then runs vendor CLIs if installed:
   - **Cursor:** `cursor agent mcp list` (and `list-tools tymio-discovery` when available)
   - **Claude Code:** `claude mcp list`
   - **Codex:** `codex mcp list` with the fake `HOME`

## Prerequisites

- Node **≥ 20**, npm workspaces as in this monorepo.
- **Cursor**, **Claude Code**, and/or **Codex** CLIs on `PATH` only if you want step (3). The script still validates bootstrap without them.

### PATH (Cursor, Claude Code, Codex)

The smoke script **sources** [`scripts/env-agent-clis.sh`](../scripts/env-agent-clis.sh) automatically. It prepends common locations **without** duplicating entries:

- **Cursor:** `/Applications/Cursor.app/Contents/Resources/app/bin` (macOS app bundle)
- **Homebrew:** `/opt/homebrew/bin`, `/usr/local/bin`
- **`~/.local/bin`** (e.g. Claude Code installed outside npm global)
- **`$(npm config get prefix)/bin`** when `npm` is on `PATH`
- **`~/.volta/bin`**, **`~/.fnm/aliases/default/bin`** when present

Extra directories (colon-separated):

```bash
TYMIO_AGENT_CLI_PATH_EXTRA="$HOME/somewhere/bin:/opt/codex/bin" ./scripts/local-agent-clients-smoke.sh
```

To use the same PATH in **every** terminal (e.g. for manual `claude mcp list`), add to **`~/.zshrc`**:

```bash
source /path/to/proproman/scripts/env-agent-clis.sh
```

(Use your real clone path, or `source "$(git -C /path/to/proproman rev-parse --show-toplevel)/scripts/env-agent-clis.sh"` from a fixed repo location.)

## Commands

From the repository root:

```bash
# Safe: dry-run bootstrap for cursor / claude / codex + doctor
./scripts/local-agent-clients-smoke.sh
```

```bash
# Also materialize configs under a temp tree and call cursor / claude / codex when present
WRITE=1 ./scripts/local-agent-clients-smoke.sh
```

```bash
# Use a specific slug in generated MCP URLs (default: smoke-ws)
TYMIO_SMOKE_SLUG=my-tenant ./scripts/local-agent-clients-smoke.sh
```

```bash
# Skip vendor CLI calls even when WRITE=1 (only file writes + bootstrap)
WRITE=1 SKIP_VENDOR_CLIS=1 ./scripts/local-agent-clients-smoke.sh
```

```bash
# One client at a time (run doctor only on the first)
ONLY=cursor WRITE=1 ./scripts/local-agent-clients-smoke.sh
ONLY=claude WRITE=1 SKIP_DOCTOR=1 ./scripts/local-agent-clients-smoke.sh
ONLY=codex WRITE=1 SKIP_DOCTOR=1 ./scripts/local-agent-clients-smoke.sh
```

## What “good” looks like

- **`doctor`** prints version and config paths without crashing.
- **Dry-run** prints planned bootstrap actions and exits **0**.
- With **`WRITE=1`**, **`cursor agent mcp list`** / **`claude mcp list`** / **`codex mcp list`** should at least **list** `tymio-discovery` (and `tymio-<slug>` when `--slug` was set). Connection state (green vs error) still depends on **OAuth** and **network**; use `tymio-mcp login` separately for a real session.

**Cursor:** `agent mcp list` may show servers as **not loaded (needs approval)** until you approve them in the UI (or via `cursor agent mcp enable <id>` if your Cursor version supports it). **`list-tools`** can fail until the server is approved and reachable — that is still a useful wiring check (the server **names** appear).

**Claude Code / Codex:** If the `claude` or `codex` binary is not on `PATH`, the script prints a tip; install the official CLI and re-run with **`WRITE=1`**.

## npm shortcut

```bash
npm run local:agent-clients
```

## Deep testing (live hub MCP + OAuth)

This goes **beyond** bootstrap file merges: it uses **saved `tymio-mcp login` tokens** and the MCP SDK to call **`tools/list`** on the real hosted endpoint (requires network).

```bash
# Discovery only: https://tymio.app/mcp — expect tymio_list_my_workspaces + tymio_mcp_routing_guide
npm run smoke:deep --workspace mcp
```

```bash
# Full workspace MCP: must include tymio_health / tymio_meta / … (replace with your slug)
TYMIO_SMOKE_SLUG=your-workspace-slug npm run smoke:deep --workspace mcp
```

```bash
# After workspace list, also call tymio_health (sanity check)
TYMIO_SMOKE_SLUG=your-workspace-slug TYMIO_SMOKE_CALL_HEALTH=1 npm run smoke:deep --workspace mcp
```

```bash
# One command: Phase 1 (live MCP) + optional Phase 2 (vendor CLIs in temp dirs)
./scripts/local-agent-clients-deep.sh
RUN_VENDOR_SMOKE=1 ./scripts/local-agent-clients-deep.sh
```

From repo root: `npm run local:agent-clients-deep` (same as the shell script).

**Self-hosted hub:** set `TYMIO_API_BASE_URL=https://your-origin` together with `TYMIO_SMOKE_SLUG`.

## See also

- [TYMIO_BOOTSTRAP.md](TYMIO_BOOTSTRAP.md) — full onboarding spec.
- [mcp/README.md](../mcp/README.md) — CLI install and env vars.
