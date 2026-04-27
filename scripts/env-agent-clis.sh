# Source this file to prepend common install locations for Cursor, Claude Code, and Codex CLIs.
# Safe to `source` multiple times (dirs are not duplicated).
#
#   source scripts/env-agent-clis.sh
#
# Optional: extra colon-separated dirs
#   TYMIO_AGENT_CLI_PATH_EXTRA="$HOME/custom/bin" source scripts/env-agent-clis.sh

_tymio_prepend_path() {
  local d="${1%/}"
  [[ -z "$d" || ! -d "$d" ]] && return 0
  case ":$PATH:" in *":$d:"*) return 0 ;; esac
  PATH="$d:$PATH"
}

# Cursor (macOS app bundle — often missing from PATH)
_tymio_prepend_path "/Applications/Cursor.app/Contents/Resources/app/bin"

# Homebrew (Apple Silicon / Intel)
_tymio_prepend_path "/opt/homebrew/bin"
_tymio_prepend_path "/usr/local/bin"

# User-local binaries (pipx, pip --user, some installers)
_tymio_prepend_path "${HOME}/.local/bin"

# npm global prefix (Claude Code: npm i -g @anthropic-ai/claude-code)
if command -v npm >/dev/null 2>&1; then
  _npm_prefix="$(npm config get prefix 2>/dev/null)"
  if [[ -n "${_npm_prefix:-}" && "$_npm_prefix" != "undefined" ]]; then
    _tymio_prepend_path "${_npm_prefix}/bin"
  fi
fi
unset _npm_prefix

# Volta / fnm shims (if present)
_tymio_prepend_path "${HOME}/.volta/bin"
_tymio_prepend_path "${HOME}/.fnm/aliases/default/bin"

# Extra dirs from env (colon-separated)
if [[ -n "${TYMIO_AGENT_CLI_PATH_EXTRA:-}" ]]; then
  _old_ifs="$IFS"
  IFS=:
  for _d in $TYMIO_AGENT_CLI_PATH_EXTRA; do
    _tymio_prepend_path "$_d"
  done
  IFS="$_old_ifs"
  unset _old_ifs _d
fi

unset -f _tymio_prepend_path 2>/dev/null || true

export PATH
