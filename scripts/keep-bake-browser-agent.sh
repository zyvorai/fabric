#!/usr/bin/env bash
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
#
# Bake / register the Keep browser-agent FluxVM template (Debian 12 + Chromium).
#
# Prerequisites on the FluxVM host (as a sudo-capable user):
#   - fluxctl / fluxvm with image build support
#   - musl or host fluxvm-guest-agent binary
#   - Node 20 tarball downloaded (image build has no network for commands)
#
# Usage:
#   ./scripts/keep-bake-browser-agent.sh
#   KEEP_BROWSER_GUEST_AGENT=/usr/local/bin/fluxvm-guest-agent \
#   KEEP_BROWSER_NODE_TAR=/tmp/node20.tar.xz \
#     ./scripts/keep-bake-browser-agent.sh
#
# Full image bake can take a long time and needs several GiB free. If the
# qcow2 already exists, this script only (re)registers the template.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TPL_SRC="$ROOT/agent-runtime/templates/browser-agent"
OUT_IMG="${KEEP_BROWSER_OUT:-/var/lib/fluxvm/images/browser-agent.qcow2}"
TDIR="${KEEP_BROWSER_TEMPLATE_DIR:-/var/lib/fluxvm/templates/browser-agent}"
NODE_TAR="${KEEP_BROWSER_NODE_TAR:-/tmp/node20.tar.xz}"
GUEST_AGENT="${KEEP_BROWSER_GUEST_AGENT:-}"
UNIT_SRC="${KEEP_BROWSER_UNIT:-}"

if [[ -z "$GUEST_AGENT" ]]; then
  for cand in \
    /usr/local/bin/fluxvm-guest-agent \
    /home/sus/fluxvm-build/target/release/fluxvm-guest-agent \
    "$ROOT/../fluxvm/target/release/fluxvm-guest-agent"; do
    if [[ -x "$cand" ]]; then GUEST_AGENT=$cand; break; fi
  done
fi
if [[ -z "$UNIT_SRC" ]]; then
  for cand in \
    /home/sus/fluxvm-build/systemd/fluxvm-guest-agent.service \
    "$ROOT/../fluxvm/systemd/fluxvm-guest-agent.service"; do
    if [[ -f "$cand" ]]; then UNIT_SRC=$cand; break; fi
  done
fi

echo "==> browser-agent bake"
echo "    image:    $OUT_IMG"
echo "    template: $TDIR"
echo "    node tar: $NODE_TAR"
echo "    agent:    ${GUEST_AGENT:-MISSING}"
echo "    unit:     ${UNIT_SRC:-MISSING}"

if [[ ! -f "$OUT_IMG" ]]; then
  [[ -f "$NODE_TAR" ]] || {
    echo "missing $NODE_TAR — download first:" >&2
    echo "  curl -fsSL -o $NODE_TAR https://nodejs.org/dist/v20.18.1/node-v20.18.1-linux-x64.tar.xz" >&2
    exit 1
  }
  [[ -x "$GUEST_AGENT" ]] || { echo "missing fluxvm-guest-agent binary" >&2; exit 1; }
  [[ -f "$UNIT_SRC" ]] || { echo "missing fluxvm-guest-agent.service" >&2; exit 1; }
  command -v fluxctl >/dev/null || command -v fluxvm >/dev/null || {
    echo "fluxctl/fluxvm not on PATH" >&2
    exit 1
  }

  BUILD=$(mktemp)
  trap 'rm -f "$BUILD"' EXIT
  python3 - "$TPL_SRC/build.json" "$OUT_IMG" "$NODE_TAR" "$GUEST_AGENT" "$UNIT_SRC" "$BUILD" <<'PY'
import json, sys
src, out, node, agent, unit, dest = sys.argv[1:]
spec = json.load(open(src))
spec["output"] = out
spec["copy_in"] = [
  {"src": node, "dest": "/root/node20.tar.xz"},
  {"src": agent, "dest": "/usr/local/bin/fluxvm-guest-agent"},
  {"src": unit, "dest": "/etc/systemd/system/fluxvm-guest-agent.service"},
]
json.dump(spec, open(dest, "w"), indent=2)
print("wrote", dest)
PY
  echo "==> building image (this may take a long time)"
  if command -v fluxctl >/dev/null; then
    sudo fluxctl --config /etc/fluxvm.toml build-image --spec "$BUILD"
  else
    sudo fluxvm --config /etc/fluxvm.toml build-image --spec "$BUILD"
  fi
else
  echo "==> image already present — skip build"
fi

echo "==> registering template"
sudo mkdir -p "$TDIR"
sudo cp "$TPL_SRC/spec.json" "$TDIR/spec.json"
# ensure image path matches
sudo python3 - <<PY
import json
p="$TDIR/spec.json"
d=json.load(open(p))
d["image"]="$OUT_IMG"
json.dump(d, open(p,"w"), indent=2)
print("registered", p)
PY

echo "OK — browser-agent template ready"
echo "    Try a Keep agent with template=browser-agent and browser_port=9222"
echo "    (start Chromium with --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0)."
