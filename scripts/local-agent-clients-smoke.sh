#!/usr/bin/env bash
# Local smoke: tymio-mcp bootstrap per client + optional vendor CLIs (Cursor / Claude Code / Codex).
# Safe by default: only dry-run and diagnostics. Set WRITE=1 to materialize configs in temp dirs only.
#
# Usage:
#   ./scripts/local-agent-clients-smoke.sh
#   WRITE=1 ./scripts/local-agent-clients-smoke.sh
#   ONLY=cursor WRITE=1 ./scripts/local-agent-clients-smoke.sh   # one client
#
# Optional env:
#   ONLY=cursor|claude|codex  — run a single client block (default: all)
#   SKIP_DOCTOR=1             — skip tymio-mcp doctor (e.g. after first ONLY run)
#   TYMIO_API_BASE_URL        — hub origin for bootstrap URL inference (optional)
#   TYMIO_SMOKE_SLUG          — slug for …/t/<slug>/mcp (default: smoke-ws)
#   SKIP_VENDOR_CLIS=1        — do not run cursor / claude / codex even if WRITE=1
#   TYMIO_AGENT_CLI_PATH_EXTRA — colon-separated dirs to prepend (see scripts/env-agent-clis.sh)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Prepend common macOS / npm global locations so cursor, claude, codex are found
# shellcheck disable=SC1091
[[ -f "$ROOT/scripts/env-agent-clis.sh" ]] && . "$ROOT/scripts/env-agent-clis.sh"

SLUG="${TYMIO_SMOKE_SLUG:-smoke-ws}"
TYMIO_MCP_JS="${ROOT}/mcp/dist/index.js"
ONLY="${ONLY:-}"

if [[ -n "$ONLY" && "$ONLY" != cursor && "$ONLY" != claude && "$ONLY" != codex ]]; then
  echo "Invalid ONLY=$ONLY (use cursor, claude, or codex)" >&2
  exit 1
fi

tymio_mcp() {
  node "$TYMIO_MCP_JS" "$@"
}

should_run() {
  local name="$1"
  [[ -z "$ONLY" || "$ONLY" == "$name" ]]
}

echo "==> Repo: $ROOT"
echo "==> Workspace slug for URLs: $SLUG (override with TYMIO_SMOKE_SLUG)"
if [[ -n "$ONLY" ]]; then
  echo "==> ONLY=$ONLY (single client)"
fi
echo "==> CLI on PATH: cursor=$(command -v cursor 2>/dev/null || echo '—') | claude=$(command -v claude 2>/dev/null || echo '—') | codex=$(command -v codex 2>/dev/null || echo '—')"

if [[ ! -f mcp/dist/index.js ]]; then
  echo "==> Building @tymio/mcp-server (dist missing)"
  npm run mcp:build
fi

if [[ "${SKIP_DOCTOR:-}" != "1" ]]; then
  echo ""
  echo "==> tymio-mcp doctor"
  tymio_mcp doctor || true
fi

SMOKE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/tymio-agent-smoke.XXXXXX")"
cleanup() { rm -rf "$SMOKE_ROOT"; }
trap cleanup EXIT

echo ""
echo "==> Isolated temp: $SMOKE_ROOT (removed on exit)"

pass_banner() {
  echo ""
  echo ">>> Tymio wiring check: PASS (bootstrap + CLI exited 0; approve/connect OAuth in UI as needed)"
}

warn_banner() {
  echo ""
  echo ">>> Review output above — approve MCP in the client or run: tymio-mcp login"
}

# --- Cursor-style project (.cursor/mcp.json) ---
if should_run cursor; then
  CURSOR_PROJ="$SMOKE_ROOT/cursor-proj"
  mkdir -p "$CURSOR_PROJ/.cursor"

  echo ""
  echo "=== [1/3] Cursor — tymio-mcp bootstrap --dry-run ==="
  (
    cd "$CURSOR_PROJ"
    tymio_mcp bootstrap --client cursor --slug "$SLUG" --dry-run
  )

  if [[ "${WRITE:-}" == "1" ]]; then
    echo ""
    echo "=== Cursor — write .cursor/mcp.json (temp only) ==="
    (
      cd "$CURSOR_PROJ"
      tymio_mcp bootstrap --client cursor --slug "$SLUG" --force
    )
    if [[ "${SKIP_VENDOR_CLIS:-}" != "1" ]] && command -v cursor >/dev/null 2>&1; then
      echo ""
      echo "=== Cursor CLI — agent mcp list (expect tymio-discovery + tymio-${SLUG}) ==="
      if (cd "$CURSOR_PROJ" && cursor agent mcp list); then pass_banner; else warn_banner; fi
      echo ""
      echo "=== Cursor CLI — list-tools tymio-discovery (needs approval + OAuth to succeed) ==="
      (cd "$CURSOR_PROJ" && cursor agent mcp list-tools tymio-discovery) || true
    elif [[ "${SKIP_VENDOR_CLIS:-}" != "1" ]]; then
      echo "Tip: install Cursor and ensure \`cursor\` is on PATH."
    fi
  fi
fi

# --- Claude Code project (.mcp.json) ---
if should_run claude; then
  CLAUDE_PROJ="$SMOKE_ROOT/claude-proj"
  mkdir -p "$CLAUDE_PROJ/.claude"

  echo ""
  echo "=== [2/3] Claude Code — tymio-mcp bootstrap --dry-run ==="
  (
    cd "$CLAUDE_PROJ"
    tymio_mcp bootstrap --client claude --slug "$SLUG" --dry-run
  )

  if [[ "${WRITE:-}" == "1" ]]; then
    echo ""
    echo "=== Claude Code — write .mcp.json (temp only) ==="
    (
      cd "$CLAUDE_PROJ"
      tymio_mcp bootstrap --client claude --slug "$SLUG" --force
    )
    if [[ "${SKIP_VENDOR_CLIS:-}" != "1" ]] && command -v claude >/dev/null 2>&1; then
      echo ""
      echo "=== Claude Code CLI — mcp list ==="
      if (cd "$CLAUDE_PROJ" && claude mcp list); then pass_banner; else warn_banner; fi
    elif [[ "${SKIP_VENDOR_CLIS:-}" != "1" ]]; then
      echo "Tip: install Claude Code CLI (\`claude\` on PATH)."
    fi
  fi
fi

# --- Codex global config (~/.codex/config.toml) ---
if should_run codex; then
  CODEX_HOME="$SMOKE_ROOT/codex-fake-home"
  mkdir -p "$CODEX_HOME/.codex"
  touch "$CODEX_HOME/.codex/config.toml"

  echo ""
  echo "=== [3/3] Codex — tymio-mcp bootstrap --dry-run (isolated HOME) ==="
  HOME="$CODEX_HOME" tymio_mcp bootstrap --client codex --slug "$SLUG" --dry-run

  if [[ "${WRITE:-}" == "1" ]]; then
    echo ""
    echo "=== Codex — write ~/.codex/config.toml (isolated HOME only) ==="
    HOME="$CODEX_HOME" tymio_mcp bootstrap --client codex --slug "$SLUG" --force
    if [[ "${SKIP_VENDOR_CLIS:-}" != "1" ]] && command -v codex >/dev/null 2>&1; then
      echo ""
      echo "=== Codex CLI — mcp list (isolated HOME) ==="
      if (HOME="$CODEX_HOME" codex mcp list); then pass_banner; else warn_banner; fi
    elif [[ "${SKIP_VENDOR_CLIS:-}" != "1" ]]; then
      echo "Tip: install Codex CLI (\`codex\` on PATH)."
    fi
  fi
fi

echo ""
echo "==> Done."
if [[ "${WRITE:-}" != "1" ]]; then
  echo "    Dry-run only. To write temp configs + vendor CLIs:"
  echo "      WRITE=1 ./scripts/local-agent-clients-smoke.sh"
  echo "    One client:"
  echo "      ONLY=cursor WRITE=1 ./scripts/local-agent-clients-smoke.sh"
fi
