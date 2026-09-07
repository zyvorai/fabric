#!/usr/bin/env bash
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
# CI/CD gate: Fabric /health + /readyz, optional FluxVM /healthz + /readyz.
set -euo pipefail

FABRIC_URL="${FABRIC_URL:-http://127.0.0.1:9095}"
FLUXVM_URL="${FLUXVM_URL:-http://127.0.0.1:7788}"
TIMEOUT="${ZYVOR_DEVOPS_TIMEOUT:-3}"
CHECK_FLUXVM="${ZYVOR_CHECK_FLUXVM:-1}"
ALLOW_OFFLINE="${ZYVOR_ALLOW_OFFLINE:-0}"

probe() {
  local url="$1"
  curl -sS -m "$TIMEOUT" -o /tmp/zyvor-devops-body.$$ -w '%{http_code}' "$url" || echo 000
}

fail() {
  echo "devops-gate FAIL: $*" >&2
  if [[ "$ALLOW_OFFLINE" == "1" ]]; then
    echo "devops-gate: offline allowed"
    exit 0
  fi
  exit 1
}

health="$(probe "$FABRIC_URL/health")"
echo "fabric /health $health"
if [[ "$health" != "200" ]]; then
  fail "fabric /health"
fi

ready="$(probe "$FABRIC_URL/readyz")"
echo "fabric /readyz $ready"
if [[ "$ready" != "200" && "$ready" != "503" ]]; then
  fail "fabric /readyz unexpected $ready"
fi
if [[ "$ready" != "200" ]]; then
  fail "fabric not ready (HTTP $ready) — check FluxVM"
fi

if [[ "$CHECK_FLUXVM" == "1" ]]; then
  hz="$(probe "$FLUXVM_URL/healthz")"
  echo "fluxvm /healthz $hz"
  [[ "$hz" == "200" ]] || fail "fluxvm /healthz"
  rz="$(probe "$FLUXVM_URL/readyz")"
  echo "fluxvm /readyz $rz"
  if [[ "$rz" != "200" && "$rz" != "503" ]]; then
    fail "fluxvm /readyz unexpected $rz"
  fi
  [[ "$rz" == "200" ]] || fail "fluxvm not ready"
fi

echo "devops-gate PASS"
