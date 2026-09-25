#!/usr/bin/env bash
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
#
# One-click PDF → brief.md demo (no browser, expect 0 CONNECT).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PDF=${1:-"$ROOT/examples/keep-agents/pdf-brief/sample.pdf"}
: "${KEEP_API:=${ZYVOR_AGENT_URL:-http://127.0.0.1:9096}}"
AUTH=()
if [[ -n "${KEEP_TOKEN:-${ZYVOR_AGENT_TOKEN:-}}" ]]; then
  AUTH=(-H "Authorization: Bearer ${KEEP_TOKEN:-$ZYVOR_AGENT_TOKEN}")
fi

echo "==> preflight"
curl -fsS "${AUTH[@]}" "$KEEP_API/healthz" >/dev/null || {
  echo "runtime /healthz failed" >&2
  exit 1
}
test -f "$PDF" || { echo "missing PDF: $PDF" >&2; exit 1; }

echo "==> POST /v1/demos/pdf-brief"
OUT=$(curl -fsS "${AUTH[@]}" -X POST \
  -F "pdf=@${PDF};type=application/pdf" \
  "$KEEP_API/v1/demos/pdf-brief")
echo "$OUT" | python3 -m json.tool
SID=$(echo "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['session_id'])")
CONN=$(echo "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('egress_connects', -1))")
echo "COCKPIT $KEEP_API (console /app/keep/$SID)"
if [[ "$CONN" != "0" ]]; then
  echo "FAIL: egress_connects=$CONN" >&2
  exit 2
fi
echo "OK — brief.md ready, 0 CONNECT"
