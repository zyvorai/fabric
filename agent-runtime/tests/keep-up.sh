#!/usr/bin/env bash
# scripts/keep-up.sh: the preflight refuses honestly, --dry-run changes nothing, and --token-only mints a scoped user token without
# printing the operator token or writing anything. Uses fake facts and a fake curl; needs no root, KVM or FluxVM.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
fail() { echo "keep-up: FAIL: $*" >&2; exit 1; }
ok() { echo "  ok  $*"; }
mkdir -p "$W/bin"
# a fake curl: FluxVM ready, template registered, and a user-token endpoint that records the request body
cat > "$W/bin/curl" <<'SH'
#!/usr/bin/env bash
url=""; body=""; while [[ $# -gt 0 ]]; do case "$1" in -d) body="$2"; shift ;; http*) url="$1" ;; esac; shift; done
case "$url" in
  */readyz) exit 0 ;;
  */v1/templates) echo '{"items":[{"name":"node22-agent"}]}' ;;
  */v1/user-tokens) echo "$body" > "$FAKE_BODY"; echo '{"token":"kut1.FAKE.TOKEN"}' ;;
  *) exit 22 ;;
esac
SH
chmod +x "$W/bin/curl"
printf 'ZYVOR_AGENT_LISTEN=127.0.0.1:9096\nZYVOR_AGENT_API_TOKEN=OPERATOR-SECRET-123\n' > "$W/agent.env"
export PATH="$W/bin:$PATH" FAKE_BODY="$W/body.json" KEEP_SUDO="" KEEP_ENV_FILE="$W/agent.env"
GOOD=(KEEP_UP_UNAME=Linux KEEP_UP_ARCH=x86_64 KEEP_UP_KVM=1 KEEP_UP_SYSTEMD=1 KEEP_UP_MEM_KB=8000000 KEEP_UP_DISK_KB=100000000)
up() { env "${GOOD[@]}" "$ROOT/scripts/keep-up.sh" "$@" 2>&1; }

# 1. a Mac (or any non-Linux) is refused, and says why
out=$(env KEEP_UP_UNAME=Darwin "$ROOT/scripts/keep-up.sh" --dry-run 2>&1) && fail "a non-Linux host should be refused"
grep -q "Keep cells are Linux microVMs" <<<"$out" || fail "the refusal does not explain itself: $out"
ok "a non-Linux machine is refused with a reason"

# 2. no KVM is refused (no pretending the cell is sealed)
out=$(env "${GOOD[@]}" KEEP_UP_KVM=0 "$ROOT/scripts/keep-up.sh" --dry-run 2>&1) && fail "no /dev/kvm should be refused"
grep -q "/dev/kvm" <<<"$out" && grep -q "nothing was installed" <<<"$out" || fail "no-KVM message wrong: $out"
ok "missing KVM is refused and nothing is installed"

# 3. low memory and disk are refused
out=$(env "${GOOD[@]}" KEEP_UP_MEM_KB=1000000 KEEP_UP_DISK_KB=1000000 "$ROOT/scripts/keep-up.sh" --dry-run 2>&1) && fail "low memory or disk should be refused"
grep -q "memory" <<<"$out" && grep -q "free disk" <<<"$out" || fail "resource messages missing: $out"
ok "too little memory or disk is refused"

# 4. a healthy host: --dry-run prints the whole plan and changes nothing
out=$(up --dry-run) || fail "dry run on a healthy host failed: $out"
for want in "FluxVM answers" "deploy-keep.sh local" "node22-agent is already registered" "would mint a 7-day user token" "dry run: nothing changed"; do
  grep -qF "$want" <<<"$out" || fail "dry run is missing '$want': $out"
done
[[ ! -e "$FAKE_BODY" ]] || fail "a dry run must not call the token endpoint"
ok "a dry run prints the plan and calls nothing"

# 5. --token-only mints a scoped user token, never shows the operator token, writes no file
out=$(up --token-only --user-id ana --ttl-days 2) || fail "token-only failed: $out"
grep -q "kut1.FAKE.TOKEN" <<<"$out" || fail "the user token is not shown: $out"
grep -q "OPERATOR-SECRET-123" <<<"$out" && fail "the operator token was printed"
python3 - "$FAKE_BODY" <<'PY' || fail "the token request was wrong: $(cat "$FAKE_BODY")"
import json, sys
b = json.load(open(sys.argv[1]))
assert b["user_id"] == "ana" and b["scopes"] == ["read", "run", "approve"] and b["ttl_seconds"] == 2 * 86400, b
PY
grep -rl "kut1.FAKE.TOKEN" "$W" 2>/dev/null | grep -v "^$W/bin" | grep -q . && fail "the token was written to disk"
ok "token-only mints a 2-day read/run/approve token for ana, hides the operator token, saves nothing"

# 6. bad arguments are rejected
"$ROOT/scripts/keep-up.sh" --ttl-days 8 >/dev/null 2>&1 && fail "--ttl-days 8 should be rejected"
"$ROOT/scripts/keep-up.sh" --user-id 'Bad Id' >/dev/null 2>&1 && fail "a bad --user-id should be rejected"
ok "an out-of-range TTL and a bad user id are rejected"
echo "keep-up: 6 checks passed"
