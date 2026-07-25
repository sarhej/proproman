#!/usr/bin/env bash
# Fail if any route invokes multer via bare upload.single(...) instead of
# multerSingleWithTenant(upload.single(...)). Multer callbacks drop tenant ALS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROUTES="$ROOT/server/src/routes"

if [[ ! -d "$ROUTES" ]]; then
  echo "[check-multer-tenant-als] routes dir missing: $ROUTES" >&2
  exit 1
fi

violations=0
while IFS= read -r -d '' file; do
  # Skip tests
  [[ "$file" == *.test.ts ]] && continue
  # Lines with upload.single( that are not wrapped on the same line
  while IFS= read -r line; do
    if [[ "$line" == *'upload.single('* ]] && [[ "$line" != *'multerSingleWithTenant(upload.single('* ]]; then
      echo "[check-multer-tenant-als] bare upload.single in ${file#"$ROOT/"}:" >&2
      echo "  $line" >&2
      violations=$((violations + 1))
    fi
  done < <(grep -n 'upload\.single(' "$file" || true)
done < <(find "$ROUTES" -name '*.ts' -print0)

if [[ "$violations" -gt 0 ]]; then
  echo "[check-multer-tenant-als] $violations violation(s). Wrap with multerSingleWithTenant()." >&2
  exit 1
fi

echo "[check-multer-tenant-als] OK — all upload.single calls use multerSingleWithTenant"
