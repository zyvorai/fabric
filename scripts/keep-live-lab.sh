#!/usr/bin/env bash
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
#
# Lab release gate for Keep 0.1 live proof.
# Run on the FluxVM host (or with SSH tunnel to :7788).
#
#   ./scripts/keep-live-lab.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export KEEP_E2E_FLUXVM=1
export ZYVOR_AGENT_FLUXVM_URL_LIVE="${ZYVOR_AGENT_FLUXVM_URL_LIVE:-http://127.0.0.1:7788}"
export KEEP_E2E_TEMPLATE="${KEEP_E2E_TEMPLATE:-}"

echo "==> Keep 0.1 live lab gate"
echo "    FluxVM: $ZYVOR_AGENT_FLUXVM_URL_LIVE"
echo "    Template override: ${KEEP_E2E_TEMPLATE:-auto}"

# Prefer release binary when present
if [[ -x agent-runtime/target/release/zyvor-fabric-agent-runtime ]]; then
  export KEEP_E2E_BIN="${KEEP_E2E_BIN:-$ROOT/agent-runtime/target/release/zyvor-fabric-agent-runtime}"
fi

exec ./scripts/keep-e2e.sh
