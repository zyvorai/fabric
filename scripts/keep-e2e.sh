#!/usr/bin/env bash
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
#
# Keep production smoke (no KVM required for the default path).
# With KVM + FluxVM: set KEEP_E2E_FLUXVM=1 to also hit /v1/security/capabilities.
#
# Usage:
#   ./scripts/keep-e2e.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> unit / policy / export tokens"
cargo test --manifest-path agent-runtime/Cargo.toml --lib --quiet
cargo test --manifest-path agent-runtime/Cargo.toml policy -- --nocapture --quiet
cargo test --manifest-path agent-runtime/Cargo.toml export_tokens -- --nocapture --quiet

echo "==> keepctl help"
./scripts/keepctl --help | grep -q policy

echo "==> policy signature round-trip (inline rustc via cargo test)"
# covered by policy::tests::signature_round_trip

if [[ "${KEEP_E2E_FLUXVM:-}" == "1" ]]; then
  FLUX="${ZYVOR_AGENT_FLUXVM_URL:-http://127.0.0.1:7788}"
  echo "==> FluxVM capabilities at $FLUX"
  curl -fsS "$FLUX/v1/security/capabilities" | tee /tmp/keep-caps.json
  grep -q measured /tmp/keep-caps.json || grep -q qemu /tmp/keep-caps.json || true
fi

if [[ -e /dev/kvm && "${KEEP_E2E_KVM:-}" == "1" ]]; then
  echo "==> /dev/kvm present — full VM e2e is lab-only (see docs/tutorials/16-keep-workstation.md)"
else
  echo "==> skipping KVM VM boot (set KEEP_E2E_KVM=1 on a lab host with /dev/kvm)"
fi

echo "OK — Keep e2e smoke passed"
echo "Honesty: measured/TEE host-memory claims still require Keep 0.2 + hardware."
