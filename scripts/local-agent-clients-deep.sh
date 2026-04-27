#!/usr/bin/env bash
# Deeper local testing: live hosted MCP tools/list via saved OAuth, then optional vendor CLI smoke.
#
# Usage:
#   ./scripts/local-agent-clients-deep.sh
#
# Phase 1 — always: npm run smoke:deep (needs network + tymio-mcp login once)
# Phase 2 — if RUN_VENDOR_SMOKE=1: same as local-agent-clients-smoke.sh (temp dirs + cursor/claude/codex)
#
# Workspace MCP check (full tymio_* tools):
#   TYMIO_SMOKE_SLUG=your-workspace ./scripts/local-agent-clients-deep.sh
#
# Optional tool call after workspace list:
#   TYMIO_SMOKE_SLUG=your-workspace TYMIO_SMOKE_CALL_HEALTH=1 ./scripts/local-agent-clients-deep.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
[[ -f "$ROOT/scripts/env-agent-clis.sh" ]] && . "$ROOT/scripts/env-agent-clis.sh"

echo "########## Phase 1: Live hub MCP (OAuth on disk) ##########"
npm run smoke:deep --workspace mcp
ec1=$?
if [[ "$ec1" != 0 ]]; then
  echo "Phase 1 failed (sign in: tymio-mcp login)" >&2
  exit "$ec1"
fi

if [[ "${RUN_VENDOR_SMOKE:-}" == "1" ]]; then
  echo ""
  echo "########## Phase 2: Vendor CLIs (temp config) ##########"
  WRITE=1 SKIP_DOCTOR=1 ./scripts/local-agent-clients-smoke.sh
fi

echo ""
echo "Done. For workspace tools/list + optional tymio_health:"
echo "  TYMIO_SMOKE_SLUG=<slug> npm run smoke:deep --workspace mcp"
echo "  TYMIO_SMOKE_SLUG=<slug> TYMIO_SMOKE_CALL_HEALTH=1 npm run smoke:deep --workspace mcp"
echo "Chain vendor smoke: RUN_VENDOR_SMOKE=1 ./scripts/local-agent-clients-deep.sh"
