#!/usr/bin/env bash
# Unit tests for Fabric AI Workloads (Phases 2–4 pure logic).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Remote deploys often keep cargo under ~/.cargo; CI has it on PATH.
if [[ -f "$HOME/.cargo/env" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
fi
cd "$ROOT/backend"
# Single filter matches all ai::* unit modules under the fabricd lib.
cargo test -p zyvor-fabricd --lib api::ai:: -- --nocapture
