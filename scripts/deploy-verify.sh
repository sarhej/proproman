#!/usr/bin/env bash
# Poll production health until deploy SHA matches expected commit.
set -euo pipefail

EXPECTED_SHA="${1:-$(git rev-parse HEAD)}"
URL="${DEPLOY_HEALTH_URL:-https://tymio.app/api/health}"
MAX_ATTEMPTS="${DEPLOY_VERIFY_ATTEMPTS:-40}"
INTERVAL_SEC="${DEPLOY_VERIFY_INTERVAL_SEC:-15}"

normalize_sha() {
  echo "${1,,}" | cut -c1-40
}

want="$(normalize_sha "$EXPECTED_SHA")"

echo "Deploy verify: waiting for sha ${want:0:12}… at ${URL}"
echo "  attempts=${MAX_ATTEMPTS} interval=${INTERVAL_SEC}s"

for ((i = 1; i <= MAX_ATTEMPTS; i++)); do
  if ! resp="$(curl -sf "$URL" 2>/dev/null)"; then
    echo "  [$i/$MAX_ATTEMPTS] health unreachable"
  else
    got="$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('deploy',{}).get('sha',''))" 2>/dev/null || true)"
    if [[ -n "$got" ]]; then
      got_norm="$(normalize_sha "$got")"
      if [[ "$got_norm" == "$want" ]] || [[ "${got_norm:0:7}" == "${want:0:7}" ]]; then
        echo "Deploy verified: ${got} (attempt $i)"
        echo "$resp" | python3 -m json.tool 2>/dev/null || echo "$resp"
        exit 0
      fi
      echo "  [$i/$MAX_ATTEMPTS] live sha=${got:0:12}… (want ${want:0:12}…)"
    else
      echo "  [$i/$MAX_ATTEMPTS] health ok but no deploy.sha yet (upgrade pending?)"
    fi
  fi
  sleep "$INTERVAL_SEC"
done

echo "Deploy verify FAILED: expected sha ${want:0:12}… not live after $((MAX_ATTEMPTS * INTERVAL_SEC))s" >&2
exit 1
