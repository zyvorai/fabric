#!/usr/bin/env bash
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
# ============================================================================
# keep-up — a working Keep host on THIS Linux machine, then the token to connect Solvor
# ============================================================================
#   sudo ./scripts/keep-up.sh --dry-run          # check this machine and print the plan; change nothing
#   sudo ./scripts/keep-up.sh                    # FluxVM is already installed: runtime, cell template, token
#   sudo ./scripts/keep-up.sh --install-fluxvm   # also build and install FluxVM from source (experimental, see docs)
#   sudo ./scripts/keep-up.sh --token-only       # mint a fresh user token for an existing host
#
# Options: --user-id ID (default: the login name), --ttl-days N (1-7, default 7), --no-template
#
# It does, in order: (1) preflight, (2) FluxVM check (or install), (3) the Keep runtime via `deploy-keep.sh local`,
# (4) the node22-agent cell template (scripts/keep-bake-node22-agent.sh, with poppler and tesseract), (5) a scoped user
# token, printed once with the exact Solvor settings. Nothing leaves this machine; the token is not written to disk.
# The cell is sealed only when KVM is present: the preflight refuses without it rather than pretend.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FLUXVM_URL="${KEEP_FLUXVM_URL:-http://127.0.0.1:7788}"
KEEP_URL="${KEEP_URL:-http://127.0.0.1:9096}"
ENV_FILE="${KEEP_ENV_FILE:-/etc/zyvor-fabricd/zyvor-fabric-agent.env}"

DRY=0; INSTALL_FLUXVM=0; TOKEN_ONLY=0; NO_TEMPLATE=0
USER_ID="$(id -un | tr -c 'a-z0-9._-\n' '-' | cut -c1-32)"
TTL_DAYS=7
usage() { sed -n '5,14p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --dry-run) DRY=1 ;;
    --install-fluxvm) INSTALL_FLUXVM=1 ;;
    --token-only) TOKEN_ONLY=1 ;;
    --no-template) NO_TEMPLATE=1 ;;
    --user-id) USER_ID="${2:?--user-id needs a value}"; shift ;;
    --ttl-days) TTL_DAYS="${2:?--ttl-days needs a value}"; shift ;;
    *) echo "unknown option: $1" >&2; usage 64 ;;
  esac
  shift
done
[[ "$USER_ID" =~ ^[a-z0-9._-]{1,32}$ ]] || { echo "--user-id must be 1-32 characters of a-z 0-9 . _ -" >&2; exit 64; }
[[ "$TTL_DAYS" =~ ^[1-7]$ ]] || { echo "--ttl-days must be 1 to 7 (the runtime's limit)" >&2; exit 64; }

step() { printf '\n==> %s\n' "$*"; }
ok()   { printf '  ok   %s\n' "$*"; }
info() { printf '  ..   %s\n' "$*"; }
PROBLEMS=0
bad()  { printf '  FAIL %s\n' "$*" >&2; PROBLEMS=$((PROBLEMS + 1)); }

# Sources of facts, overridable so the checks can be tested without a real host.
uname_s() { echo "${KEEP_UP_UNAME:-$(uname -s)}"; }
uname_m() { echo "${KEEP_UP_ARCH:-$(uname -m)}"; }
mem_kb()  { echo "${KEEP_UP_MEM_KB:-$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)}"; }
disk_kb() { echo "${KEEP_UP_DISK_KB:-$(df -Pk "${KEEP_UP_DISK_PATH:-/var/lib}" 2>/dev/null | awk 'NR==2 {print $4}' || echo 0)}"; }
kvm_ok()  { if [[ -n "${KEEP_UP_KVM:-}" ]]; then [[ "$KEEP_UP_KVM" == 1 ]]; else [[ -r /dev/kvm && -w /dev/kvm ]]; fi; }
systemd_ok() { if [[ -n "${KEEP_UP_SYSTEMD:-}" ]]; then [[ "$KEEP_UP_SYSTEMD" == 1 ]]; else [[ -d /run/systemd/system ]]; fi; }
SUDO=""; [[ "$(id -u)" == 0 ]] || SUDO="sudo"
SUDO="${KEEP_SUDO-$SUDO}"   # KEEP_SUDO="" disables sudo (used by the tests)

preflight() {
  step "Preflight"
  [[ "$(uname_s)" == Linux ]] && ok "Linux" || bad "this machine is $(uname_s): Keep cells are Linux microVMs on FluxVM. Run this on a Linux host (see docs/keep/README.md); on a Mac, install Solvor and point it at a Linux host"
  case "$(uname_m)" in x86_64|amd64) ok "x86_64" ;; *) bad "architecture $(uname_m): the cell image and the bake script are x86_64 only for now" ;; esac
  if kvm_ok; then ok "/dev/kvm is usable"; else bad "no usable /dev/kvm. Cells are KVM microVMs; enable virtualization (on a cloud VM, pick an instance type with nested virtualization or bare metal) and add this user to the kvm group"; fi
  systemd_ok && ok "systemd" || bad "systemd is not running (the runtime is installed as a systemd unit)"
  local mem; mem=$(mem_kb); (( mem >= 3800000 )) && ok "memory $((mem / 1024)) MiB" || bad "memory $((mem / 1024)) MiB: at least 4 GiB (the Rust build and a cell need it)"
  local disk; disk=$(disk_kb); (( disk >= 20000000 )) && ok "free disk $((disk / 1048576)) GiB" || bad "free disk $((disk / 1048576)) GiB under /var/lib: at least 20 GiB (cell images and the build)"
  if [[ "$(id -u)" == 0 ]] || command -v sudo >/dev/null 2>&1; then ok "root or sudo"; else bad "run as root or install sudo"; fi
  local c; for c in git curl python3 openssl node cargo; do
    if command -v "$c" >/dev/null 2>&1; then ok "$c"; else bad "$c is missing ($(hint "$c"))"; fi
  done
  if command -v node >/dev/null 2>&1; then
    local nv; nv=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
    (( nv >= 20 )) || bad "node $nv is too old: 20 or newer (the signer and the SDK use it)"
  fi
  if [[ -x "${KEEP_NODE_GUEST_AGENT:-/usr/local/bin/fluxvm-guest-agent}" ]]; then ok "FluxVM guest agent binary"
  else info "FluxVM guest agent binary not found yet (installed with FluxVM; the template bake needs it)"; fi
}
hint() {
  case "$1" in
    cargo) echo "install Rust from https://rustup.rs" ;;
    node) echo "install Node 20 or newer, for example from https://nodejs.org" ;;
    *) echo "for example: sudo apt-get install -y $1" ;;
  esac
}

fluxvm_ready() { curl -fsS -m 5 "$FLUXVM_URL/readyz" >/dev/null 2>&1; }
phase_fluxvm() {
  step "FluxVM"
  if fluxvm_ready; then ok "FluxVM answers at $FLUXVM_URL"; return; fi
  if [[ "$INSTALL_FLUXVM" == 0 ]]; then
    bad "FluxVM is not answering at $FLUXVM_URL. Install it first (https://github.com/zyvorai/fluxvm, Quick start), or re-run with --install-fluxvm to build it from source here"
    return
  fi
  info "building FluxVM from source (its README's Quick start; this takes a while and is experimental)"
  if [[ "$DRY" == 1 ]]; then
    info "would: clone zyvorai/fluxvm and zyvorai/guestkit side by side, run scripts/bootstrap-host.sh vmbr0, cargo build --release, install fluxctl and fluxvm-hypervisor and /etc/fluxvm.toml"
    return
  fi
  local d="${KEEP_FLUXVM_SRC:-/opt/fluxvm-src}"
  $SUDO mkdir -p "$d" && $SUDO chown "$(id -un)" "$d"
  [[ -d "$d/fluxvm" ]] || git clone https://github.com/zyvorai/fluxvm.git "$d/fluxvm"
  [[ -d "$d/guestkit" ]] || git clone https://github.com/zyvorai/guestkit.git "$d/guestkit"
  ( cd "$d/fluxvm" && $SUDO ./scripts/bootstrap-host.sh vmbr0 && ./scripts/preflight.sh && cargo build --release )
  for b in fluxctl fluxvm-hypervisor; do $SUDO install -m 0755 "$d/fluxvm/target/release/$b" "/usr/local/bin/$b"; done
  [[ -f /etc/fluxvm.toml ]] || $SUDO install -m 0644 "$d/fluxvm/config.example.toml" /etc/fluxvm.toml
  if fluxvm_ready; then ok "FluxVM answers at $FLUXVM_URL"
  else bad "FluxVM is built and installed but is not answering at $FLUXVM_URL: start its control plane (see the FluxVM docs, operations) and re-run"; fi
}

phase_runtime() {
  step "Keep runtime"
  if [[ "$DRY" == 1 ]]; then info "would run: $SCRIPT_DIR/deploy-keep.sh local   (builds agent-runtime, installs its unit, Keep mode on, csv-clean smoke test)"; return; fi
  "$SCRIPT_DIR/deploy-keep.sh" local
}

template_listed() { curl -fsS -m 5 "$FLUXVM_URL/v1/templates" 2>/dev/null | grep -q '"node22-agent"'; }
phase_template() {
  step "Cell template (node22-agent: Node, poppler, tesseract)"
  if [[ "$NO_TEMPLATE" == 1 ]]; then info "skipped (--no-template)"; return; fi
  if template_listed; then ok "node22-agent is already registered"; return; fi
  if [[ "$DRY" == 1 ]]; then info "would run: $SCRIPT_DIR/keep-bake-node22-agent.sh"; return; fi
  "$SCRIPT_DIR/keep-bake-node22-agent.sh"
}

operator_token() { $SUDO sed -n 's/^ZYVOR_AGENT_API_TOKEN=//p' "$ENV_FILE" 2>/dev/null | head -1; }
mint_token() {
  local op body resp
  op=$(operator_token); [[ -n "$op" ]] || { echo "no operator token in $ENV_FILE (has the runtime been installed?)" >&2; return 1; }
  body=$(printf '{"user_id":"%s","scopes":["read","run","approve"],"ttl_seconds":%d}' "$USER_ID" $((TTL_DAYS * 86400)))
  resp=$(curl -fsS -m 10 -X POST -H "Authorization: Bearer $op" -H 'content-type: application/json' -d "$body" "$KEEP_URL/v1/user-tokens") \
    || { echo "could not mint a user token at $KEEP_URL (is the runtime running?)" >&2; return 1; }
  python3 -c 'import json,sys; t=json.load(sys.stdin)["token"]; assert t.startswith("kut1."); print(t)' <<<"$resp"
}
phase_token() {
  step "Token for Solvor"
  if [[ "$DRY" == 1 ]]; then info "would mint a $TTL_DAYS-day user token for '$USER_ID' with scopes read, run, approve (never the operator token)"; return; fi
  local tok; tok=$(mint_token) || { bad "no token minted"; return; }
  local host; host=$(hostname 2>/dev/null || echo this-host)
  cat <<OUT

  Keep is up on this machine. To connect Solvor from your Mac:

    1. On the Mac:   ssh -N -L 9096:127.0.0.1:9096 $(id -un)@$host
    2. In Solvor, Settings:   Host  http://127.0.0.1:9096
                              User  $USER_ID
                              Token $tok
       (or: make run KEEP_HOST=http://127.0.0.1:9096 KEEP_TOKEN=$tok   in the Solvor repo)

  The token is valid for $TTL_DAYS day(s), scoped to '$USER_ID' (read, run, approve), and was not saved anywhere.
  Mint another with: sudo $0 --token-only --user-id $USER_ID
  Evidence class is software-test: the cell has no network, but whoever operates this host can read cell memory.
OUT
}

if [[ "$TOKEN_ONLY" == 1 ]]; then phase_token; (( PROBLEMS == 0 )); exit $?; fi
preflight
phase_fluxvm
if (( PROBLEMS > 0 )); then echo; echo "==> $PROBLEMS problem(s) above; nothing was installed" >&2; exit 1; fi
phase_runtime
phase_template
phase_token
(( PROBLEMS == 0 )) || exit 1
[[ "$DRY" == 1 ]] && echo && echo "==> dry run: nothing changed"
exit 0
