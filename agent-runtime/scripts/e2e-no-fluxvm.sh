#!/usr/bin/env bash
# End-to-end check of the agent runtime binary on real sockets. No FluxVM needed:
# sessions are seeded on disk and the reviewer is a local mock. Needs Linux-style
# bash 4 (associative arrays), python3, curl, and outbound HTTPS to example.com/.org.
#   cargo build --release && agent-runtime/scripts/e2e-no-fluxvm.sh
set -uo pipefail
export PATH="$HOME/.cargo/bin:$PATH"
BIN="${BIN:-$(cd "$(dirname "$0")/.." && pwd)/target/release/zyvor-fabric-agent-runtime}"
W="$(mktemp -d /tmp/zyvor-agent-e2e.XXXXXX)"
API=http://127.0.0.1:19096
PROXY=127.0.0.1:19083
TOKEN=e2e-token
PASS=0; FAIL=0
pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null; done; rm -rf "$W"; }
trap cleanup EXIT

check() { # name, expected, actual
  if [[ "$3" == *"$2"* ]]; then echo "PASS  $1"; PASS=$((PASS+1)); else echo "FAIL  $1  (want '$2', got '$3')"; FAIL=$((FAIL+1)); fi
}
api() { curl -s -o /dev/stderr -w '%{http_code}' -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "$@" 2>"$W/body"; }
body() { cat "$W/body"; }

# --- mock reviewer: deny anything with "evil" in the host, escalate the rest
cat > "$W/reviewer.py" <<'PY'
import json, http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers['Content-Length']); req = json.loads(self.rfile.read(n))
        sent = json.loads(req['messages'][1]['content'])
        v = 'deny' if 'evil' in sent['host'] else 'escalate'
        out = json.dumps({'choices':[{'message':{'content':json.dumps({'verdict':v,'reason':'mock saw '+sent['host']})}}]}).encode()
        self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(out))); self.end_headers(); self.wfile.write(out)
    def log_message(self,*a): pass
http.server.HTTPServer(('127.0.0.1',19100),H).serve_forever()
PY
python3 "$W/reviewer.py" & pids+=($!)

start_runtime() {
  ZYVOR_AGENT_API_TOKEN=$TOKEN ZYVOR_AGENT_LISTEN=127.0.0.1:19096 ZYVOR_AGENT_EGRESS_LISTEN=127.0.0.1:19082 \
  ZYVOR_AGENT_PROXY_LISTEN=$PROXY ZYVOR_AGENT_STATE_DIR="$W/state" ZYVOR_AGENT_SNAPSHOT_DIR="$W/snap" \
  ZYVOR_AGENT_FLUXVM_URL=http://127.0.0.1:1 ZYVOR_AGENT_SYNC_INTERVAL_MS=3600000 \
  ZYVOR_AGENT_MAX_VCPUS=2 ZYVOR_AGENT_MAX_MEMORY_MIB=8192 \
  ZYVOR_AGENT_SENTINEL_URL=http://127.0.0.1:19100/v1 ZYVOR_AGENT_SENTINEL_MODEL=mock \
  "$BIN" >"$W/runtime.log" 2>&1 & RT=$!; pids+=($RT)
  for _ in $(seq 50); do curl -s -o /dev/null "$API/v1/agents" -H "Authorization: Bearer $TOKEN" && return 0; sleep 0.2; done
  echo "runtime did not start"; cat "$W/runtime.log"; exit 1
}
BUNDLE=$(printf 'export default 1' | base64)
deploy() { # name, manifest-json
  api -X POST "$API/v1/agents" -d "{\"name\":\"$1\",\"bundle_base64\":\"$BUNDLE\",\"manifest\":$2}"
}

start_runtime
echo "== deploy validation"
check "resources over the vcpu ceiling are rejected" 400 "$(deploy sized '{"template":"t","resources":{"vcpus":4,"memory_mib":4096}}')"
check "  ...with a clear reason" "exceeds this runtime's limit" "$(body)"
check "resources within the ceilings deploy" 200 "$(deploy sized2 '{"template":"t","resources":{"vcpus":2,"memory_mib":7900}}' | sed 's/^20[01]$/200/')"
check "shared home volume still needs max_concurrent_sessions 1" 400 "$(deploy shared '{"template":"t","home_volume":{}}')"
check "per-user home volume drops that rule" 200 "$(deploy peruser '{"template":"t","home_volume":{"per_user":true}}' | sed 's/^20[01]$/200/')"
check "browser template manifest (per-user + sized + sentinel)" 200 "$(deploy browser '{"template":"browser-agent","resources":{"vcpus":2,"memory_mib":7900},"home_volume":{"per_user":true},"egress_mode":"sentinel","egress_allow_hosts":["example.com"]}' | sed 's/^20[01]$/200/')"

echo "== session user_id"
check "per-user agent requires user_id" 400 "$(api -X POST "$API/v1/sessions" -d '{"agent":"peruser"}')"
check "  ...with a clear reason" "user_id is required" "$(body)"
check "malformed user_id is rejected" 400 "$(api -X POST "$API/v1/sessions" -d '{"agent":"peruser","user_id":"Bad User"}')"
code=$(api -X POST "$API/v1/sessions" -d '{"agent":"peruser","user_id":"alice"}')
check "valid user_id passes validation (then fails only at FluxVM: 502)" 502 "$code"

# --- deploy the proxy agents, then seed sessions for them
deploy allow '{"template":"t","egress_allow_hosts":["example.com"]}' >/dev/null
deploy denyall '{"template":"t"}' >/dev/null
deploy sentinel '{"template":"t","egress_mode":"sentinel","egress_approval_timeout_seconds":60}' >/dev/null
declare -A VER CAP SID
for a in allow denyall sentinel; do
  VER[$a]=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/v1/agents/$a" | python3 -c 'import sys,json;print(json.load(sys.stdin)["version"])')
done
kill $RT; wait $RT 2>/dev/null; pids=("${pids[@]/$RT}")
for a in allow denyall sentinel; do
  SID[$a]=$(python3 -c 'import uuid;print(uuid.uuid4())'); CAP[$a]=cap-$a-$RANDOM
  mkdir -p "$W/state/sessions/${SID[$a]}"
  python3 - "$a" "${SID[$a]}" "${VER[$a]}" "${CAP[$a]}" "$W" <<'PY'
import sys, json, uuid, datetime
a, sid, ver, cap, w = sys.argv[1:]
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
json.dump({"id": sid, "agent": a, "agent_version": ver, "sandbox_id": str(uuid.uuid4()), "status": "running",
           "input": {}, "created_at": now, "updated_at": now, "last_event_seq": 0, "guest_event_cursor": 0,
           "capability_token": cap}, open(f"{w}/state/sessions/{sid}/session.json", "w"))
PY
done
start_runtime

px() { # agent, host:port, extra curl args -> http code of the CONNECT+request
  curl -s -o /dev/null -w '%{http_code}' --max-time 30 -x "http://${SID[$1]}:${CAP[$1]}@$PROXY" "https://$2/" "${@:3}"
}
raw() { # agent, connect target -> first response line (raw CONNECT)
  python3 - "$PROXY" "${SID[$1]}" "${CAP[$1]}" "$2" <<'PY'
import sys, socket, base64
hp, sid, cap, target = sys.argv[1:]
h, p = hp.split(":"); s = socket.create_connection((h, int(p)), 10)
auth = base64.b64encode(f"{sid}:{cap}".encode()).decode()
s.sendall(f"CONNECT {target} HTTP/1.1\r\nHost: {target}\r\nProxy-Authorization: Basic {auth}\r\n\r\n".encode())
print(s.recv(600).decode().replace("\r\n", " | "))
PY
}

echo "== CONNECT proxy (real HTTPS through the runtime)"
check "allowlisted host: real TLS tunnel to example.com returns 200" 200 "$(px allow example.com)"
check "unlisted host in deny mode is refused" "403" "$(raw denyall example.com:443)"
check "non-443 port is refused" "403" "$(raw allow example.com:25)"
check "private destination is blocked even for an allowlisted-style target" "403" "$(raw denyall 127.0.0.1:443)"
check "bad capability gets 407" 407 "$(curl -s -o /dev/null -w '%{http_connect}' -x "http://${SID[allow]}:wrong@$PROXY" https://example.com/)"
check "plain http:// through the proxy is refused" 405 "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -x "http://${SID[allow]}:${CAP[allow]}@$PROXY" http://example.com/)"

echo "== Sentinel"
check "reviewer deny refuses with the reviewer's reason" "denied by sentinel" "$(raw sentinel evil.example:443)"
# escalate: request is held until an operator approves it through the API
( px sentinel example.org > "$W/held.code" ) & held=$!
for _ in $(seq 60); do
  aid=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/v1/approvals" | python3 -c 'import sys,json
d=json.load(sys.stdin); it=d["items"] if isinstance(d,dict) else d
p=[a for a in it if a["status"]=="pending"]; print(p[0]["id"] if p else "")')
  [[ -n "$aid" ]] && break; sleep 0.5
done
check "escalated request opens an egress approval carrying the reviewer note" "mock saw example.org" \
  "$(curl -s -H "Authorization: Bearer $TOKEN" "$API/v1/approvals")"
check "operator approves once" 200 "$(api -X POST "$API/v1/approvals/$aid" -d '{"decision":"approved","scope":"once"}')"
wait $held
check "held tunnel then completes with a real 200" 200 "$(cat "$W/held.code")"

echo "== journal"
audit=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/v1/audit?limit=200")
check "egress.connect entries recorded" egress.connect "$audit"
check "sentinel.egress denial recorded" sentinel.egress "$audit"
check "tunnel byte counts recorded" bytes_down "$audit"
verify=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/v1/audit/verify" 2>/dev/null); echo "audit verify: ${verify:0:120}"

echo; echo "passed=$PASS failed=$FAIL"
[[ $FAIL -eq 0 ]]
