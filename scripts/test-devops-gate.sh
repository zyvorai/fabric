#!/usr/bin/env bash
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$ROOT/scripts/devops-gate.sh"

# Offline without flag must fail
if FABRIC_URL=http://127.0.0.1:1 FLUXVM_URL=http://127.0.0.1:1 \
  ZYVOR_DEVOPS_TIMEOUT=0.2 ZYVOR_ALLOW_OFFLINE=0 \
  "$GATE"; then
  echo "expected fail when offline" >&2
  exit 1
fi

# Offline with flag must pass
FABRIC_URL=http://127.0.0.1:1 FLUXVM_URL=http://127.0.0.1:1 \
  ZYVOR_DEVOPS_TIMEOUT=0.2 ZYVOR_ALLOW_OFFLINE=1 \
  "$GATE"

echo "test-devops-gate: ok"
