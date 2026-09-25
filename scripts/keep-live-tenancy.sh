#!/usr/bin/env bash
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
#
# Two users on a LIVE shard, in real cells: user tokens, isolation, a phone-signed approval, and (with
# --gateway) the reference vendor gateway in front. Needs the operator token; needs the node22-agent template.
#
#   export KEEP_API=http://127.0.0.1:9096 KEEP_TOKEN=<operator token>
#   ./scripts/keep-live-tenancy.sh                # tokens, isolation, signed approval
#   ./scripts/keep-live-tenancy.sh --gateway      # ...and a vendor login through the reference gateway
#
# It creates users named live-ana-<n>, live-ben-<n>, live-gw-<n> and one device; it removes the device and
# revokes the tokens afterwards. The runs and audit rows it makes stay (that is what they are for).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${KEEP_API:=${ZYVOR_AGENT_URL:-http://127.0.0.1:9096}}"
: "${KEEP_TOKEN:=${ZYVOR_AGENT_TOKEN:-}}"
[[ -n "$KEEP_TOKEN" ]] || { echo "KEEP_TOKEN (the operator token) is required" >&2; exit 2; }
GATEWAY=0; [[ "${1:-}" == "--gateway" ]] && GATEWAY=1
N=$RANDOM
ANA="live-ana-$N"; BEN="live-ben-$N"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/keep-live-tenancy.XXXXXX")"
PIDS=(); PASSED=0; FAILED=0
cleanup() {
  for p in ${PIDS[@]+"${PIDS[@]}"}; do kill "$p" 2>/dev/null || true; done
  for u in "$ANA" "$BEN" "live-gw-$N"; do
    curl -s -o /dev/null -X POST -H "Authorization: Bearer $KEEP_TOKEN" "$KEEP_API/v1/users/$u/revoke-tokens"
  done
  curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $KEEP_TOKEN" "$KEEP_API/v1/users/$ANA/devices/live-phone"
  rm -rf "$WORK"
}
trap cleanup EXIT
ok()  { PASSED=$((PASSED + 1)); echo "  ok   $*"; }
bad() { FAILED=$((FAILED + 1)); echo "  FAIL $*"; }
json() { python3 -c 'import json,sys
d=json.load(sys.stdin)
for p in sys.argv[1].split("."): d=d[int(p)] if p.isdigit() else d[p]
print(d)' "$1"; }
op()  { curl -s -H "Authorization: Bearer $KEEP_TOKEN" "$@"; }
as()  { local t=$1; shift; curl -s -H "Authorization: Bearer $t" "$@"; }
check() { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (want '$3', got '$2')"; fi; }
code() { local t=$1; shift; curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $t" "$@"; }
PHONE="node $ROOT/sdk/agent-runtime/src/phone-cli.js"

echo "==> live tenancy against $KEEP_API"
curl -sf "$KEEP_API/healthz" >/dev/null || { echo "runtime not reachable" >&2; exit 2; }
mint() { op -X POST -H 'content-type: application/json' -d "{\"user_id\":\"$1\",\"ttl_seconds\":900}" "$KEEP_API/v1/user-tokens" | json token; }
TA=$(mint "$ANA"); TB=$(mint "$BEN")
[[ "$TA" == kut1.* && "$TB" == kut1.* ]] && ok "the operator minted a token for each user" || { bad "could not mint user tokens (does this runtime have the tenancy build?)"; exit 1; }
printf 'name,qty\nAna,1\n' > "$WORK/a.csv"; printf 'name,qty\nBen,2\n' > "$WORK/b.csv"

echo "== two users, real cells"
ra=$(as "$TA" -X POST -F "file=@$WORK/a.csv" "$KEEP_API/v1/demos/csv-clean"); rb=$(as "$TB" -X POST -F "file=@$WORK/b.csv" "$KEEP_API/v1/demos/csv-clean")
SA=$(json session_id <<<"$ra" 2>/dev/null); SB=$(json session_id <<<"$rb" 2>/dev/null)
AA=$(json artifacts.0.id <<<"$ra" 2>/dev/null); AB=$(json artifacts.0.id <<<"$rb" 2>/dev/null)
check "ana's run: real cell, 0 CONNECT" "$(json egress_connects <<<"$ra" 2>/dev/null)" "0"
check "ben's run: real cell, 0 CONNECT" "$(json egress_connects <<<"$rb" 2>/dev/null)" "0"
check "ana lists only her own session" "$(as "$TA" "$KEEP_API/v1/sessions" | python3 -c 'import json,sys; print(",".join(s["id"] for s in json.load(sys.stdin)["items"]))')" "$SA"
check "ana cannot read ben's session" "$(code "$TA" "$KEEP_API/v1/sessions/$SB")" "404"
check "ana cannot read ben's cockpit" "$(code "$TA" "$KEEP_API/v1/sessions/$SB/cockpit")" "404"
check "ana cannot read ben's artifact" "$(code "$TA" "$KEEP_API/v1/artifacts/$AB")" "404"
check "ana cannot diff against ben's artifact" "$(code "$TA" "$KEEP_API/v1/artifacts/$AA/diff/$AB")" "404"
check "ana's audit slice has no row of ben's session" "$(as "$TA" "$KEEP_API/v1/audit?limit=500" | python3 -c 'import json,sys; t=json.dumps(json.load(sys.stdin)["items"]); print("SB" if "'"$SB"'" in t else "clean")')" "clean"
check "operator routes are closed to a user token" "$(code "$TA" "$KEEP_API/v1/keep/status")" "403"
check "a user token in the URL is refused" "$(curl -s -o /dev/null -w '%{http_code}' "$KEEP_API/v1/sessions?token=$TA")" "401"
check "usage counts ana's run" "$(as "$TA" "$KEEP_API/v1/usage" | json usage.runs)" "1"

echo "== a phone-signed approval on the shard"
$PHONE keygen "$WORK/phone.key" p256 >/dev/null
$PHONE enrol "$WORK/phone.key" live-phone --push-kind fcm --push-token T > "$WORK/enrol.json"
check "the operator enrols ana's phone key" "$(op -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' --data-binary @"$WORK/enrol.json" "$KEEP_API/v1/users/$ANA/devices")" "201"
check "ana's own token cannot enrol a key" "$(code "$TA" -X POST -H 'content-type: application/json' --data-binary @"$WORK/enrol.json" "$KEEP_API/v1/users/$ANA/devices")" "403"
AP=$(op -X POST -H 'content-type: application/json' -d "{\"session_id\":\"$SA\",\"kind\":\"send\",\"subject\":\"mail.example\",\"prompt\":\"live test approval\",\"planned_action\":{\"method\":\"POST\",\"body_sha256\":\"abc\"}}" "$KEEP_API/v1/approvals" | json id)
as "$TA" "$KEEP_API/v1/inbox" | python3 -c 'import json,sys; p=[a for a in json.load(sys.stdin)["pending_approvals"] if a["id"]=="'"$AP"'"]; assert len(p)==1 and "sign" in p[0]; json.dump(p[0], open("'"$WORK"'/appr.json","w"))' && ok "ana's inbox lists the approval with what to sign" || bad "the inbox did not list the approval"
check "ben cannot see ana's approval" "$(as "$TB" "$KEEP_API/v1/approvals" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["items"]))')" "0"
check "ben cannot decide ana's approval" "$(code "$TB" -X POST -H 'content-type: application/json' -d '{"decision":"approved"}' "$KEEP_API/v1/approvals/$AP")" "404"
$PHONE keygen "$WORK/intruder.key" p256 >/dev/null
$PHONE decide "$WORK/intruder.key" live-phone "$WORK/appr.json" approved > "$WORK/forged.json"
check "a decision signed by another key is refused" "$(code "$TA" -X POST -H 'content-type: application/json' --data-binary @"$WORK/forged.json" "$KEEP_API/v1/approvals/$AP")" "403"
$PHONE decide "$WORK/phone.key" live-phone "$WORK/appr.json" denied > "$WORK/denied.json"
python3 -c 'import json; d=json.load(open("'"$WORK"'/denied.json")); d["decision"]="approved"; json.dump(d, open("'"$WORK"'/flipped.json","w"))'
check "a decision flipped after signing is refused" "$(code "$TA" -X POST -H 'content-type: application/json' --data-binary @"$WORK/flipped.json" "$KEEP_API/v1/approvals/$AP")" "403"
check "the approval is still pending" "$(op "$KEEP_API/v1/approvals" | python3 -c 'import json,sys; print([a for a in json.load(sys.stdin)["items"] if a["id"]=="'"$AP"'"][0]["status"])')" "pending"
$PHONE decide "$WORK/phone.key" live-phone "$WORK/appr.json" approved > "$WORK/ok.json"
c=$(as "$TA" -o "$WORK/decide.out" -w '%{http_code}' -X POST -H 'content-type: application/json' --data-binary @"$WORK/ok.json" "$KEEP_API/v1/approvals/$AP")
# A demo session has no agent to steer, so the API may answer 500 after it has recorded the decision.
[[ "$c" == "200" || ( "$c" == "500" && "$(cat "$WORK/decide.out")" == *"reading agent record"* ) ]] && ok "the phone-signed decision is accepted" || bad "the signed decision: HTTP $c $(head -c 200 "$WORK/decide.out")"
check "the approval is recorded as approved" "$(op "$KEEP_API/v1/approvals" | python3 -c 'import json,sys; print([a for a in json.load(sys.stdin)["items"] if a["id"]=="'"$AP"'"][0]["status"])')" "approved"
op "$KEEP_API/v1/audit?limit=500&session_id=$SA" | python3 -c 'import json,sys; r=json.load(sys.stdin)["items"]; assert any(x["action"]=="approval.device_signature" and x["phase"]=="performed" for x in r) and sum(1 for x in r if x["action"]=="approval.device_signature" and x["phase"]=="failed")>=2' && ok "the journal has the accepted signature and the refused attempts" || bad "the journal is missing the signature rows"

echo "== revocation"
op -o /dev/null -X POST "$KEEP_API/v1/users/$ANA/revoke-tokens"
check "revoking ana cuts off ana" "$(code "$TA" "$KEEP_API/v1/sessions")" "401"
check "ben is unaffected" "$(code "$TB" "$KEEP_API/v1/sessions")" "200"

if [[ "$GATEWAY" == 1 ]]; then
  echo "== the reference gateway in front of this shard"
  GW_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
  cat > "$WORK/gw.json" <<JSON
{"jwtSecret":"live-login-secret","relaySecret":"live-relay","adminKey":"live-admin","defaultRegion":"lab","port":$GW_PORT,
 "stateFile":"$WORK/gw-users.json","shards":[{"id":"lab-1","region":"lab","url":"$KEEP_API","token":"$KEEP_TOKEN"}]}
JSON
  node "$ROOT/reference/vendor-gateway/src/main.js" "$WORK/gw.json" >"$WORK/gw.log" 2>&1 & PIDS+=($!)
  GW="http://127.0.0.1:$GW_PORT"
  for _ in $(seq 1 50); do curl -sf "$GW/healthz" >/dev/null && break; sleep 0.2; done
  LOGIN=$(node --input-type=module -e 'import {signJwt} from "'"$ROOT"'/reference/vendor-gateway/src/jwt.js"; console.log(signJwt({sub:"live-gw-'"$N"'",exp:Math.floor(Date.now()/1000)+600},"live-login-secret"))')
  check "the gateway refuses a request with no login" "$(curl -s -o /dev/null -w '%{http_code}' "$GW/api/sessions")" "401"
  rg=$(curl -s -H "Authorization: Bearer $LOGIN" -X POST -F "file=@$WORK/a.csv" "$GW/api/demos/csv-clean")
  check "a vendor login runs a real cell through the gateway, 0 CONNECT" "$(json egress_connects <<<"$rg" 2>/dev/null)" "0"
  check "the gateway lists only that user's session" "$(curl -s -H "Authorization: Bearer $LOGIN" "$GW/api/sessions" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["items"]))')" "1"
  check "the gateway does not expose operator routes" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $LOGIN" "$GW/api/keep/status")" "404"
fi

echo
echo "passed=$PASSED failed=$FAILED"
[[ "$FAILED" == 0 ]]
