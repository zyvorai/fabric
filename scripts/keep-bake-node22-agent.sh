#!/usr/bin/env bash
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
#
# Bake and register the node22-agent FluxVM template (Ubuntu 24.04 + Node 22 + poppler + tesseract + guest agent):
# the cell every Keep use case runs in.
#
# Run on the FluxVM host, as a user with sudo:
#   ./scripts/keep-bake-node22-agent.sh              # download Node, build the image, register the template
#   ./scripts/keep-bake-node22-agent.sh --dry-run    # print the plan and what is missing; change nothing
#   ./scripts/keep-bake-node22-agent.sh --force      # rebuild even if the image exists
#
# Environment overrides are listed in agent-runtime/templates/node22-agent/README.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/agent-runtime/templates/node22-agent"
NODE_VERSION="${KEEP_NODE_VERSION:-22.11.0}"
NODE_TAR="${KEEP_NODE_TAR:-/tmp/node.tar.xz}"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
OUT_IMG="${KEEP_NODE_OUT:-/var/lib/fluxvm/images/node22-agent.qcow2}"
TDIR="${KEEP_NODE_TEMPLATE_DIR:-/var/lib/fluxvm/templates/node22-agent}"
GUEST_AGENT="${KEEP_NODE_GUEST_AGENT:-/usr/local/bin/fluxvm-guest-agent}"
BASE_IMG="${KEEP_NODE_BASE_IMG:-}"
FLUX_CONFIG="${KEEP_FLUXVM_CONFIG:-/etc/fluxvm.toml}"
DRY=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    -h|--help) sed -n '5,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 64 ;;
  esac
done

FLUX=""
for c in fluxctl fluxvm; do command -v "$c" >/dev/null 2>&1 && { FLUX=$c; break; }; done

problems=0
need() { echo "  MISSING: $*" >&2; problems=$((problems + 1)); }

echo "==> node22-agent bake"
echo "    image:       $OUT_IMG"
echo "    template:    $TDIR"
echo "    node:        v$NODE_VERSION ($NODE_TAR)"
echo "    guest agent: $GUEST_AGENT"
echo "    base image:  ${BASE_IMG:-$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['source'])" "$SRC/build.json")}"
echo "    builder:     ${FLUX:-none}"

[[ -n "$FLUX" ]] || need "fluxvm / fluxctl on the PATH"
[[ -x "$GUEST_AGENT" ]] || need "guest agent binary at $GUEST_AGENT (set KEEP_NODE_GUEST_AGENT)"
[[ -z "$BASE_IMG" || -f "$BASE_IMG" ]] || need "base image $BASE_IMG"
command -v python3 >/dev/null || need "python3"
if [[ -x "$GUEST_AGENT" ]] && command -v ldd >/dev/null 2>&1; then
  if ldd "$GUEST_AGENT" 2>&1 | grep -q "libc.so"; then
    echo "  WARNING: $GUEST_AGENT is dynamically linked. If it needs a newer glibc than the guest has it will fail to start" >&2
    echo "           in the guest ('GLIBC_x.y not found'). Prefer a static (musl) build." >&2
  fi
fi
if [[ ! -f "$NODE_TAR" ]]; then
  echo "    (will download $NODE_URL)"
  command -v curl >/dev/null || need "curl (to fetch Node)"
fi
if [[ -f "$OUT_IMG" && "$FORCE" == 0 ]]; then echo "    image exists: the build will be skipped (use --force to rebuild)"; fi

if (( problems > 0 )); then echo "==> $problems problem(s) above" >&2; exit 1; fi
if (( DRY )); then echo "==> dry run: nothing changed"; exit 0; fi

if [[ ! -f "$OUT_IMG" || "$FORCE" == 1 ]]; then
  if [[ ! -f "$NODE_TAR" ]]; then
    echo "==> downloading Node v$NODE_VERSION"
    curl -fSL -o "$NODE_TAR.part" "$NODE_URL"
    mv "$NODE_TAR.part" "$NODE_TAR"
  fi
  STAGE="$(mktemp -d)"
  trap 'rm -rf "$STAGE"' EXIT
  cp "$SRC/fluxvm-guest-agent.service" "$STAGE/"
  BUILD="$STAGE/build.json"
  python3 - "$SRC/build.json" "$BUILD" "$OUT_IMG" "$NODE_TAR" "$GUEST_AGENT" "$STAGE/fluxvm-guest-agent.service" "$BASE_IMG" "$NODE_VERSION" <<'PY'
import json, sys
src, dest, out, node, agent, unit, base, version = sys.argv[1:]
spec = json.load(open(src))
spec["output"] = out
if base:
    spec["source"] = base
spec["copy_in"] = [
    {"src": node, "dest": "/root/node.tar.xz"},
    {"src": agent, "dest": "/usr/local/bin/fluxvm-guest-agent"},
    {"src": unit, "dest": "/etc/systemd/system/fluxvm-guest-agent.service"},
]
spec["pins"] = {"node": f"v{version}"}
json.dump(spec, open(dest, "w"), indent=2)
PY
  echo "==> building the image (a few minutes; needs several GiB free)"
  sudo "$FLUX" --config "$FLUX_CONFIG" build-image --spec "$BUILD"
else
  echo "==> image already present: skipping the build"
fi

echo "==> registering the template"
sudo mkdir -p "$TDIR"
sudo cp "$SRC/spec.json" "$TDIR/spec.json"
sudo python3 - "$TDIR/spec.json" "$OUT_IMG" <<'PY'
import json, sys
path, image = sys.argv[1:]
d = json.load(open(path))
d["image"] = image
json.dump(d, open(path, "w"), indent=2)
print("registered", path)
PY

if command -v curl >/dev/null 2>&1; then
  if curl -fsS -m 5 http://127.0.0.1:7788/v1/templates 2>/dev/null | grep -q '"node22-agent"'; then
    echo "OK: FluxVM lists node22-agent"
  else
    echo "Registered, but FluxVM did not list it yet (restart the control plane if it does not appear):"
    echo "  curl -s http://127.0.0.1:7788/v1/templates"
  fi
fi
echo "Next: ./scripts/keep-demo.sh csv-clean"
