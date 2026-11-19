#!/usr/bin/env bash
# Erfasst Golden Files der Alt-API (Backend muss auf localhost:3000 laufen).
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
OUT="$(cd "$(dirname "$0")" && pwd)/golden"
mkdir -p "$OUT"
count=0

fetch() { # <pfad> <dateiname>
  local tmp
  tmp="$(mktemp)"
  curl -sS -f --max-time 120 "$BASE$1" -o "$tmp"
  node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));fs.writeFileSync(process.argv[2],JSON.stringify(j,null,2)+'\n');" "$tmp" "$OUT/$2"
  rm -f "$tmp"
  count=$((count + 1))
  echo "ok $2"
}

fetch /api/stats stats.json
for y in 2025 2026; do fetch "/api/data/year/$y" "year-$y.json"; done

for ym in 2025-01 2025-02 2025-03 2025-04 2025-05 2025-06 2025-07 2025-08 2025-09 2025-10 2025-11 2025-12 \
          2026-01 2026-02 2026-03 2026-04 2026-05 2026-06 2026-07 2026-08 2026-09 2026-10 2026-11; do
  fetch "/api/data/month/${ym%-*}/${ym#*-}" "month-$ym.json"
done

for d in 2025-01-01 2025-03-30 2025-06-30 2025-08-29 2025-10-26 2026-01-06 2026-03-29 2026-06-27 2026-11-08 2026-11-18; do
  fetch "/api/data/day/$d" "day-$d.json"
done

echo "Fertig: $count Dateien in $OUT"
