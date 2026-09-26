#!/usr/bin/env bash
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
# ============================================================================
# keep-demo-local — try Keep's use cases on this laptop in two minutes. NOT SEALED.
# ============================================================================
#   ./scripts/keep-demo-local.sh            # start the simulator and the runtime, print how to connect, run until Ctrl-C
#   ./scripts/keep-demo-local.sh --dry-run  # check the tools and print the plan
#
# Needs: python3, node 20+, curl, and either cargo (to build the runtime once) or KEEP_RUNTIME_BIN. No KVM, no Docker, no root.
#
# THIS IS A SIMULATOR. There is no VM and no network policy: the fixed extractors run as ordinary processes on this machine, so nothing here is
# isolated and the "0 connections" number is not evidence. Every result says "SIMULATED, not sealed" (evidence class `simulated`), and Solvor
# and the console show that instead of the proof. It exists so you can see what the use cases give you before you set up a Keep host
# (scripts/keep-up.sh). Never feed it files you would not run a script on.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN="${KEEP_RUNTIME_BIN:-$ROOT/agent-runtime/target/debug/zyvor-fabric-agent-runtime}"
SIM_PORT="${KEEP_SIM_PORT:-17788}"
API_PORT="${KEEP_LOCAL_PORT:-19096}"
EGRESS_PORT="${KEEP_LOCAL_EGRESS_PORT:-18082}"
DRY=0
case "${1:-}" in
  --dry-run) DRY=1 ;;
  -h|--help) sed -n '5,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "") ;;
  *) echo "unknown option: $1" >&2; exit 64 ;;
esac

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1 ($2)" >&2; MISSING=1; }; }
MISSING=0
need python3 "install Python 3"
need curl "install curl"
need node "install Node 20 or newer: https://nodejs.org"
if [[ ! -x "$BIN" ]]; then need cargo "install Rust from https://rustup.rs, or set KEEP_RUNTIME_BIN to a built runtime"; fi
(( MISSING == 0 )) || exit 1
if command -v node >/dev/null 2>&1 && (( $(node -p 'process.versions.node.split(".")[0]') < 20 )); then echo "node 20 or newer is required" >&2; exit 1; fi
for p in "$SIM_PORT" "$API_PORT" "$EGRESS_PORT"; do
  if (echo >"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then echo "port $p is already in use (set KEEP_SIM_PORT / KEEP_LOCAL_PORT / KEEP_LOCAL_EGRESS_PORT)" >&2; exit 1; fi
done

echo "keep-demo-local: SIMULATOR, NOT SEALED (no VM, no network policy). Runtime at http://127.0.0.1:$API_PORT"
if (( DRY )); then
  echo "would: build the runtime if needed, start the simulator on :$SIM_PORT and the runtime on :$API_PORT with a random operator token,"
  echo "       mint a 1-day user token, print the Solvor settings and a first command, then wait until Ctrl-C and delete its temporary state"
  exit 0
fi

WORK="$(mktemp -d)"
PIDS=()
cleanup() { for p in ${PIDS[@]+"${PIDS[@]}"}; do kill "$p" 2>/dev/null || true; done; wait 2>/dev/null || true; rm -rf "$WORK"; echo; echo "keep-demo-local: stopped, temporary state removed"; }
trap cleanup EXIT INT TERM

[[ -x "$BIN" ]] || { echo "building the runtime (once)..."; cargo build --manifest-path "$ROOT/agent-runtime/Cargo.toml" 2>&1 | tail -2; }
[[ -d "$ROOT/sdk/agent-runtime/node_modules" ]] || npm install --prefix "$ROOT/sdk/agent-runtime" --no-audit --no-fund >/dev/null

OP_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
mkdir -p "$WORK/sandboxes" "$WORK/state" "$WORK/snap"
SANDBOX_STUB_PORT="$SIM_PORT" SANDBOX_STUB_ROOT="$WORK/sandboxes" python3 "$ROOT/agent-runtime/tests/sandbox_stub.py" >"$WORK/sim.log" 2>&1 &
PIDS+=($!)
env ZYVOR_AGENT_API_TOKEN="$OP_TOKEN" ZYVOR_AGENT_LISTEN="127.0.0.1:$API_PORT" ZYVOR_AGENT_EGRESS_LISTEN="127.0.0.1:$EGRESS_PORT" \
    ZYVOR_AGENT_PROXY_LISTEN=off ZYVOR_AGENT_FLUXVM_URL="http://127.0.0.1:$SIM_PORT" ZYVOR_AGENT_EGRESS_ADVERTISE_HOST=127.0.0.1 \
    ZYVOR_AGENT_STATE_DIR="$WORK/state" ZYVOR_AGENT_SNAPSHOT_DIR="$WORK/snap" RUST_LOG=warn "$BIN" >"$WORK/runtime.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 100); do curl -sf -o /dev/null "http://127.0.0.1:$API_PORT/healthz" && break; sleep 0.2; done
curl -sf -o /dev/null "http://127.0.0.1:$API_PORT/healthz" || { echo "the runtime did not start:"; tail -20 "$WORK/runtime.log"; exit 1; }

USER_TOKEN="$(curl -fsS -X POST -H "Authorization: Bearer $OP_TOKEN" -H 'content-type: application/json' \
  -d '{"user_id":"demo","scopes":["read","run","approve"],"ttl_seconds":86400}' "http://127.0.0.1:$API_PORT/v1/user-tokens" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')"

cat <<OUT

  ============================================================
   SIMULATED, NOT SEALED. Files run as ordinary processes on
   this machine. Use only files you would run a script on.
  ============================================================

  Try a use case now (a sample file ships with each pack):

    KEEP_API=http://127.0.0.1:$API_PORT KEEP_TOKEN=$USER_TOKEN $ROOT/scripts/keep-demo.sh csv-clean
    KEEP_API=http://127.0.0.1:$API_PORT KEEP_TOKEN=$USER_TOKEN $ROOT/scripts/keep-demo.sh list

  Solvor (Mac app): Settings, Host http://127.0.0.1:$API_PORT, User demo, Token above
    or, in the Solvor repo:  make run KEEP_HOST=http://127.0.0.1:$API_PORT KEEP_TOKEN=$USER_TOKEN

  Solvor shows an amber "Simulated, not sealed" notice instead of the proof pill.
  For a real sealed cell, set up a host: scripts/keep-up.sh (needs Linux with KVM).

  Ctrl-C stops everything and deletes the temporary state.
OUT
wait
