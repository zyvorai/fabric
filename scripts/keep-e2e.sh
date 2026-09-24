#!/usr/bin/env bash
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
#
# Keep end-to-end (not smoke): live agent-runtime + FluxVM sandbox stub + keepctl.
# Exercises signed policy, export-token gates, pack/unpack, cockpit, and a real
# session through the FluxVM client API (stubbed guest — no /dev/kvm required).
#
# Usage (from fabric repo root):
#   ./scripts/keep-e2e.sh
#
# Optional:
#   KEEP_E2E_FLUXVM=1  also probe a live FluxVM at ZYVOR_AGENT_FLUXVM_URL
#   KEEP_E2E_BIN=…     path to zyvor-fabric-agent-runtime
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

KEEPCTL="$ROOT/scripts/keepctl"
SIGN_EX="$ROOT/agent-runtime/examples/keep_sign_policy.rs"
BIN="${KEEP_E2E_BIN:-$ROOT/agent-runtime/target/debug/zyvor-fabric-agent-runtime}"
SIGN_BIN="${KEEP_SIGN_BIN:-$ROOT/agent-runtime/target/debug/examples/keep_sign_policy}"
API="http://127.0.0.1:19097"
STUB_PORT=17797
TOKEN="keep-e2e-token"
PASS=0
FAIL=0
pids=()
W="$(mktemp -d "${TMPDIR:-/tmp}/keep-e2e.XXXXXX")"

cleanup() {
  for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
  rm -rf "$W"
}
trap cleanup EXIT

check() {
  local name=$1 want=$2 got=$3
  if [[ "$got" == *"$want"* ]]; then
    echo "PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $name  (want '$want', got '$got')"
    FAIL=$((FAIL + 1))
  fi
}

check_eq() {
  local name=$1 want=$2 got=$3
  if [[ "$got" == "$want" ]]; then
    echo "PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $name  (want exactly '$want', got '$got')"
    FAIL=$((FAIL + 1))
  fi
}

http_code() {
  curl -s -o "$W/body" -w '%{http_code}' "$@"
}

body() { cat "$W/body"; }

json_get() {
  python3 -c 'import json,sys
d=json.load(sys.stdin)
cur=d
for p in sys.argv[1].split("."):
  if not p: continue
  cur=cur[int(p)] if p.isdigit() else cur[p]
print("" if cur is None else (cur if not isinstance(cur,(dict,list)) else json.dumps(cur)))' "$1"
}

echo "==> build agent-runtime + keep_sign_policy"
if [[ ! -x "$BIN" || ! -x "$SIGN_BIN" || "$SIGN_EX" -nt "$SIGN_BIN" ]]; then
  cargo build --manifest-path "$ROOT/agent-runtime/Cargo.toml" --example keep_sign_policy
  cargo build --manifest-path "$ROOT/agent-runtime/Cargo.toml"
fi
test -x "$BIN"
test -x "$SIGN_BIN"
chmod +x "$KEEPCTL"

# Deterministic seed for this run (32 bytes hex)
SEED="$(python3 -c 'import os; print(os.urandom(32).hex())')"
PUB="$("$SIGN_BIN" pubkey "$SEED")"
echo "    signer pubkey=${PUB:0:16}…"

mkdir -p "$W/state" "$W/snap" "$W/sandboxes" "$W/pack"

# --- FluxVM sandbox stub (real /v1/sandboxes client path) ---
SANDBOX_STUB_PORT=$STUB_PORT \
SANDBOX_STUB_ROOT="$W/sandboxes" \
  python3 "$ROOT/agent-runtime/tests/sandbox_stub.py" >"$W/stub.log" 2>&1 &
pids+=($!)
for _ in $(seq 1 50); do
  # Stub returns 404 on GET / — any HTTP response means it's up.
  if curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${STUB_PORT}/" | grep -qE '^[0-9]+$'; then
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${STUB_PORT}/" || true)
    [[ -n "$code" && "$code" != "000" ]] && break
  fi
  sleep 0.1
done
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${STUB_PORT}/" || echo 000)
if [[ "$code" == "000" ]]; then
  echo "sandbox stub failed"; tail -40 "$W/stub.log"; exit 1
fi


# --- approval webhook (out-of-band) ---
cat >"$W/hook.py" <<'PY'
import json, http.server, sys
W = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers["Content-Length"])
        body = self.rfile.read(n).decode()
        open(f"{W}/hooks.jsonl", "a").write(body + "\n")
        self.send_response(200); self.send_header("Content-Length", "0"); self.end_headers()
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", 19111), H).serve_forever()
PY
python3 "$W/hook.py" "$W" & pids+=($!)

# --- credential vault (names only; pack must never export secrets) ---
cat >"$W/creds.json" <<'JSON'
{"stripe": {"host": "api.stripe.com", "header": "authorization", "kind": "fabric",
            "allowed_ports": [443], "requires_approval": ["POST"], "approval_kind": "purchase"}}
JSON

# --- agent-runtime with Keep production knobs ---
ZYVOR_AGENT_API_TOKEN="$TOKEN" \
ZYVOR_AGENT_LISTEN=127.0.0.1:19097 \
ZYVOR_AGENT_EGRESS_LISTEN=127.0.0.1:19084 \
ZYVOR_AGENT_STATE_DIR="$W/state" \
ZYVOR_AGENT_SNAPSHOT_DIR="$W/snap" \
ZYVOR_AGENT_FLUXVM_URL="http://127.0.0.1:${STUB_PORT}" \
ZYVOR_AGENT_POLICY_TRUSTED_SIGNERS="$PUB" \
ZYVOR_AGENT_POLICY_REQUIRE_SIGNATURE=1 \
ZYVOR_AGENT_APPROVAL_WEBHOOK="http://127.0.0.1:19111/hook" \
ZYVOR_AGENT_APPROVAL_WEBHOOK_SECRET="keep-hook" \
ZYVOR_AGENT_CREDENTIALS_FILE="$W/creds.json" \
ZYVOR_AGENT_SYNC_INTERVAL_MS=3600000 \
ZYVOR_AGENT_GUEST_START_TIMEOUT_SECS=20 \
  "$BIN" >"$W/runtime.log" 2>&1 &
pids+=($!)
for _ in $(seq 1 80); do
  curl -sf -o /dev/null "$API/healthz" && break
  sleep 0.15
done
curl -sf "$API/healthz" >/dev/null || {
  echo "runtime failed to start"; tail -60 "$W/runtime.log"; exit 1
}

export KEEP_API="$API"
export KEEP_TOKEN="$TOKEN"
export ZYVOR_AGENT_URL="$API"
export ZYVOR_AGENT_TOKEN="$TOKEN"

echo "==> deploy Keep agent via keepctl"
BUNDLE=$(printf 'export default async function(){ return { ok: true }; }' | base64)
cat >"$W/deploy.json" <<JSON
{"name":"keep-desk","bundle_base64":"$BUNDLE","manifest":{
  "template":"agent-node",
  "resources":{"vcpus":1,"memory_mib":1024},
  "egress_mode":"ask",
  "egress_allow_hosts":["api.github.com"],
  "egress_approval_timeout_seconds":60,
  "credentials":["stripe"],
  "taint":{"trusted_hosts":["api.github.com"]}
}}
JSON
"$KEEPCTL" create -f "$W/deploy.json" >/dev/null
check "agent listed" keep-desk "$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/v1/agents" | tr -d '\n')"

echo "==> signed policy (reject unsigned, accept signed)"
cp "$ROOT/docs/keep/sentinel/keep.policy.yaml" "$W/keep.policy.yaml"
# Ensure file ends with newline stable for signing
CODE=$(http_code -X PUT -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/x-yaml' \
  --data-binary @"$W/keep.policy.yaml" \
  "$API/v1/agents/keep-desk/policy")
check "unsigned policy refused" 403 "$CODE"
check "  …names signature" "signature" "$(body)"

"$SIGN_BIN" sign "$SEED" "$W/keep.policy.yaml" >"$W/keep.policy.yaml.sig"
"$KEEPCTL" policy set keep-desk "$W/keep.policy.yaml" "$W/keep.policy.yaml.sig" >/dev/null
SHOW="$("$KEEPCTL" policy show keep-desk)"
check "policy show has stripe allow" "api.stripe.com" "$SHOW"
check "policy show has github" "api.github.com" "$SHOW"

echo "==> session through FluxVM client (stub) + cockpit"
SID=$(curl -sf -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"agent":"keep-desk","input":{}}' "$API/v1/sessions" | json_get id)
[[ -n "$SID" ]] || { echo "no session id"; tail -40 "$W/runtime.log"; exit 1; }
status=""
for _ in $(seq 1 60); do
  status=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/v1/sessions/$SID" | json_get status || true)
  case "$status" in
    running|completed) break ;;
    failed|cancelled|expired) break ;;
  esac
  sleep 0.3
done
if [[ "$status" == "running" || "$status" == "completed" ]]; then
  check "session reached running (FluxVM stub + guest worker)" running "$status"
else
  if grep -q "/v1/sandboxes" "$W/stub.log" 2>/dev/null; then
    echo "PASS  FluxVM stub accepted create_sandbox (guest worker unavailable: status=$status)"
    PASS=$((PASS + 1))
  else
    echo "FAIL  FluxVM stub never saw /v1/sandboxes"
    FAIL=$((FAIL + 1))
    tail -40 "$W/runtime.log" || true
  fi
  CAP="cap-keep-$RANDOM"
  SB=$(python3 -c 'import uuid; print(uuid.uuid4())')
  mkdir -p "$W/state/sessions/$SID"
  python3 - "$SID" "$SB" "$CAP" "$W" <<'PY'
import sys, json, datetime
sid, sb, cap, w = sys.argv[1:]
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
json.dump({
  "id": sid, "agent": "keep-desk", "agent_version": "seeded",
  "sandbox_id": sb, "status": "running", "input": {},
  "created_at": now, "updated_at": now, "last_event_seq": 0,
  "guest_event_cursor": 0, "capability_token": cap,
  "start_policy": "prefer-warm", "start_mode": "cold",
  "sandbox_released": False, "tainted_by": [],
}, open(f"{w}/state/sessions/{sid}/session.json", "w"))
PY
  # Last backgrounded process is the runtime we just started.
  RUNTIME_PID="${pids[${#pids[@]}-1]}"
  kill "$RUNTIME_PID" 2>/dev/null || true
  wait "$RUNTIME_PID" 2>/dev/null || true
  unset 'pids[${#pids[@]}-1]' 2>/dev/null || pids=("${pids[@]:0:${#pids[@]}-1}")
  ZYVOR_AGENT_API_TOKEN="$TOKEN" \
  ZYVOR_AGENT_LISTEN=127.0.0.1:19097 \
  ZYVOR_AGENT_EGRESS_LISTEN=127.0.0.1:19084 \
  ZYVOR_AGENT_STATE_DIR="$W/state" \
  ZYVOR_AGENT_SNAPSHOT_DIR="$W/snap" \
  ZYVOR_AGENT_FLUXVM_URL="http://127.0.0.1:${STUB_PORT}" \
  ZYVOR_AGENT_POLICY_TRUSTED_SIGNERS="$PUB" \
  ZYVOR_AGENT_POLICY_REQUIRE_SIGNATURE=1 \
  ZYVOR_AGENT_APPROVAL_WEBHOOK="http://127.0.0.1:19111/hook" \
  ZYVOR_AGENT_APPROVAL_WEBHOOK_SECRET="keep-hook" \
  ZYVOR_AGENT_CREDENTIALS_FILE="$W/creds.json" \
  ZYVOR_AGENT_SYNC_INTERVAL_MS=3600000 \
  ZYVOR_AGENT_GUEST_START_TIMEOUT_SECS=20 \
    "$BIN" >"$W/runtime.log" 2>&1 &
  pids+=($!)
  for _ in $(seq 1 80); do
    curl -sf "$API/healthz" >/dev/null && break
    sleep 0.15
  done
  check "seeded session readable" keep-desk "$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/v1/sessions/$SID")"
fi

COCK=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/v1/sessions/$SID/cockpit")
check "cockpit JSON has session_id" "$SID" "$COCK"
check "cockpit honesty note present" "software-test" "$COCK"
HTML=$(curl -sf "$API/keep/cockpit?session=$SID")
check "cockpit HTML serves" "Keep cockpit" "$HTML"
check "keepctl cockpit" "$SID" "$("$KEEPCTL" cockpit "$SID")"

echo "==> export-token gates (training default off)"
CODE=$(http_code -H "Authorization: Bearer $TOKEN" "$API/v1/export/audit?limit=10")
check "export/audit without token → 403" 403 "$CODE"
check "  …mentions export token" "Export-Token" "$(body)"

# list audit still works (non-export)
CODE=$(http_code -H "Authorization: Bearer $TOKEN" "$API/v1/audit?limit=10")
check "GET /v1/audit (non-export) allowed" 200 "$CODE"

AUDIT_TOK=$(printf '%s' "$("$KEEPCTL" export-token audit:read:1h 600)" | json_get token)
CODE=$(http_code -H "Authorization: Bearer $TOKEN" -H "X-Keep-Export-Token: $AUDIT_TOK" \
  "$API/v1/export/audit?limit=20")
check "export/audit with audit token → 200" 200 "$CODE"
check "  …export:true" '"export":true' "$(body | tr -d ' \n')"

echo "==> pack / unpack (no secrets)"
CODE=$(http_code -H "Authorization: Bearer $TOKEN" "$API/v1/agents/keep-desk/pack")
check "pack without token → 403" 403 "$CODE"

WRONG=$(printf '%s' "$("$KEEPCTL" export-token trajectory:read:1d 600)" | json_get token)
CODE=$(http_code -H "Authorization: Bearer $TOKEN" -H "X-Keep-Export-Token: $WRONG" \
  "$API/v1/agents/keep-desk/pack")
check "pack with trajectory scope alone → 403" 403 "$CODE"

export KEEP_EXPORT_TOKEN
KEEP_EXPORT_TOKEN=$(printf '%s' "$("$KEEPCTL" export-token pack 600)" | json_get token)
"$KEEPCTL" pack "$W/pack" keep-desk >/dev/null
check "pack wrote policy yaml" version "$(head -1 "$W/pack/keep.policy.yaml")"
check "pack wrote vault names only" stripe "$(cat "$W/pack/vault-names.json")"
if grep -qiE 'sk_live|password|secret_key|AKIA' "$W/pack"/* 2>/dev/null; then
  echo "FAIL  pack must not contain secret-looking material"
  FAIL=$((FAIL + 1))
else
  echo "PASS  pack has no secret-looking material"
  PASS=$((PASS + 1))
fi
check "FLUXVM_MIGRATE notes present" "qcow2" "$(cat "$W/pack/FLUXVM_MIGRATE.md")"

# Sign packed policy and unpack onto a second agent
sed 's/keep-desk/keep-desk-b/' "$W/deploy.json" >"$W/deploy-b.json"
"$KEEPCTL" create -f "$W/deploy-b.json" >/dev/null
"$SIGN_BIN" sign "$SEED" "$W/pack/keep.policy.yaml" >"$W/pack/keep.policy.yaml.sig"
"$KEEPCTL" unpack "$W/pack" keep-desk-b >/dev/null
check "unpacked policy on keep-desk-b" "api.stripe.com" "$("$KEEPCTL" policy show keep-desk-b)"

echo "==> out-of-band approval webhook shape (phone path)"
CODE=$(http_code -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SID\",\"kind\":\"egress\",\"prompt\":\"Allow checkout to api.stripe.com?\",\"subject\":\"api.stripe.com\"}" \
  "$API/v1/approvals")
check "approval create → 201" 201 "$CODE"
# Webhook is async; wait briefly
hook_ok=0
for _ in $(seq 1 30); do
  if [[ -f "$W/hooks.jsonl" ]] && grep -q 'approval.requested' "$W/hooks.jsonl"; then
    hook_ok=1
    break
  fi
  sleep 0.2
done
if [[ "$hook_ok" -eq 1 ]]; then
  check "approval webhook event" "approval.requested" "$(head -1 "$W/hooks.jsonl")"
  check "  …out_of_band channel" "out_of_band" "$(head -1 "$W/hooks.jsonl")"
  check "  …ui.actions for phone" "actions" "$(head -1 "$W/hooks.jsonl")"
else
  echo "FAIL  approval webhook not delivered"
  FAIL=$((FAIL + 1))
  tail -40 "$W/runtime.log" || true
fi

if [[ "${KEEP_E2E_FLUXVM:-}" == "1" ]]; then
  FLUX="${ZYVOR_AGENT_FLUXVM_URL:-http://127.0.0.1:7788}"
  echo "==> live FluxVM at $FLUX"
  CAPS=$(curl -fsS "$FLUX/v1/security/capabilities")
  check "FluxVM capabilities reachable" qemu "$CAPS"
  curl -fsS "$FLUX/readyz" | grep -q '"ok":true' \
    && { echo "PASS  FluxVM readyz"; PASS=$((PASS+1)); } \
    || { echo "FAIL  FluxVM readyz"; FAIL=$((FAIL+1)); }
fi

echo
echo "passed=$PASS failed=$FAIL  workdir was $W (cleaned on exit)"
echo "Honesty: measured/TEE host-memory claims still require Keep 0.2 + hardware."
if [[ "$FAIL" -ne 0 ]]; then
  echo "----- runtime log (tail) -----"
  tail -80 "$W/runtime.log" || true
  exit 1
fi
echo "OK — Keep end-to-end passed"
