#!/usr/bin/env bash
# scripts/deploy-remote.sh — rsync sources to remote, compile & install ONLY on remote
#
# Nothing is built on your laptop: cargo/npm run on the SSH host (--quick skips system deps).
# Locals only need rsync + ssh (no Rust/Node locally).
set -euo pipefail

declare -a REST=()

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/deploy-common.sh
source "$SCRIPT_DIR/lib/deploy-common.sh"

SSH_PORT="${SSH_PORT:-22}"
HEALTH_URL="${HEALTH_URL:-https://127.0.0.1:9095/health}"
STRICT="${STRICT:-0}"
API_PORT="${API_PORT:-9095}"

info() { deploy_ui_info_b "$@"; }
ok()   { deploy_ui_info "$@"; }
warn() { deploy_ui_warn "$@"; }
die()  { deploy_ui_error "$@"; }
hr()   { deploy_ui_hr; }
phase() { deploy_ui_phase "$@"; }
tip()  { deploy_ui_note "$@"; }

banner_deploy() {
    local host="$1" user="$2" rdir="$3" mode="$4"
    local ver="${VMSPAWN_VERSION:-dev}" commit="${VMSPAWN_COMMIT:-?}"
    deploy_ui_banner "Remote deploy → ${user}@${host}" "${ver} · ${commit}"
    deploy_ui_kv "🎯" "SSH target" "${user}@${host}"
    deploy_ui_kv "📁" "Remote tree" "$rdir"
    deploy_ui_kv "📋" "Plan" "$mode"
    deploy_ui_kv "💚" "Health" "${HEALTH_URL}"
    deploy_ui_note "Build runs on the server (sources rsync'd — not compiled locally)"
}

elapsed_fmt() { vmspawn_elapsed_fmt "$1"; }

DEPLOY_SSH_OPTS=(
    -o StrictHostKeyChecking=accept-new
    -o ConnectTimeout=30
    -o ServerAliveInterval=15
    -o ServerAliveCountMax=120
    -o TCPKeepAlive=yes
    -o ControlMaster=no
    -p "$SSH_PORT"
)
SSH_OPTS=("${DEPLOY_SSH_OPTS[@]}")
RSYNC_RSH="ssh ${SSH_OPTS[*]}"
DEPLOY_SSH_TTY_OPTS=()

usage() {
    cat <<'EOF'
deploy-remote.sh USER@HOST | USER HOST [PASSWORD] [--sync-only|--quick|--e2e|--verify-apis|--cleanup|--dry-run|--uninstall]
        [--remote-build|--remote-check] [--bind ADDR] [--open-firewall] [--no-start] [--deps-only]

Prefer: ./scripts/deploy remote USER@HOST [flags]  |  ./scripts/deploy status

deploy-remote.sh check [USER@HOST | USER HOST]

Flow: rsync → ~/zyvor-fabric (or DEPLOY_DIR) → build on server → install → systemd → web.
Full install: system deps + cargo build + systemd + dashboard.
Quick: skip system deps (rsync + build + install + web).
Open the UI at https://HOST:9095 (self-signed cert by default; config listens on 0.0.0.0 for remote IPv4 deploys).

--remote-build   After rsync+chown, run `cargo build --release -p zyvor-fabricd -p zyvorctl` only.
--remote-check   Same but `cargo check` (faster compile smoke).
--uninstall      Stop service, remove binaries/units; keeps /var/lib/zyvor-fabricd data.

Vendor binaries (guestkit-agent-cli, zyvor-guest-agent, ephemera-guest-agent)
live outside this repo's build and are NOT rebuilt by this script -- run
./scripts/build-vendor-binaries.sh USER@HOST after changing guestkit or
Ephemera's guest-agent source.

Auth: SSH keys/agent by default; optional PASSWORD arg or SSHPASS env → sshpass.

Examples:
  deploy-remote.sh sus@212.8.252.194 --quick
  deploy-remote.sh sus 212.8.252.194 --quick
  deploy-remote.sh 212.8.252.194 sus --quick    # HOST USER (auto-swapped)
  deploy-remote.sh sus@host --remote-check
  deploy-remote.sh sus@host --e2e
  deploy-remote.sh sus@host --verify-apis
  deploy-remote.sh check sus@host

Env: DEPLOY_HOST DEPLOY_USER DEPLOY_DIR SSH_PORT SSHPASS HEALTH_URL STRICT SYNC_ONLY

After each rsync, sudo chown on the deploy tree so interrupted sudo builds cannot
leave root-owned target/ (cargo EACCES on --quick).

Output uses ANSI colors when stdout is a TTY. Set NO_COLOR=1 to disable.
EOF
    exit 0
}

[[ "${1:-}" == -h || "${1:-}" == --help ]] && usage

vmspawn_build_metadata "$REPO"

if [[ $# -gt 0 && "${1:-}" == -* ]] && vmspawn_load_deploy_last "$REPO"; then
    set -- "${USER}@${HOST}" "$@"
    ok "Using .deploy-last → ${USER}@${HOST}"
fi

ssh_r_bash() {
    local remote="$1"
    shift
    local -a ssh_args=("${SSH_OPTS[@]}")
    ((${#DEPLOY_SSH_TTY_OPTS[@]})) && ssh_args+=("${DEPLOY_SSH_TTY_OPTS[@]}")
    if [[ -n "${SSHPASS:-}" ]] && command -v sshpass &>/dev/null; then
        printf '%s\n' "$@" | SSHPASS="$SSHPASS" sshpass -e ssh "${ssh_args[@]}" "$remote" "exec bash -s"
    else
        printf '%s\n' "$@" | ssh "${ssh_args[@]}" "$remote" "exec bash -s"
    fi
}

ssh_r() {
    if [[ $# -eq 2 && "$2" != bash && "$2" != "bash -s" && "$2" != "exec bash -s" ]]; then
        ssh_r_bash "$1" "$2"
        return
    fi
    local -a ssh_args=("${SSH_OPTS[@]}")
    ((${#DEPLOY_SSH_TTY_OPTS[@]})) && ssh_args+=("${DEPLOY_SSH_TTY_OPTS[@]}")
    if [[ -n "${SSHPASS:-}" ]] && command -v sshpass &>/dev/null; then
        SSHPASS="$SSHPASS" sshpass -e ssh "${ssh_args[@]}" "$@"
    else
        ssh "${ssh_args[@]}" "$@"
    fi
}

rsync_r() {
    if [[ -n "${SSHPASS:-}" ]] && command -v sshpass &>/dev/null; then
        SSHPASS="$SSHPASS" sshpass -e rsync -az --delete \
            --exclude='*.qcow2' --exclude='*.raw' --exclude='*.vmdk' \
            --exclude='*.iso' --exclude='*.img' --exclude='*.ova' \
            --exclude='.git' --exclude='target/' --exclude='node_modules/' \
            --exclude='web/node_modules/' --exclude='web/dist/' \
            --exclude='*.tpmstate' --exclude='*.tpmstate/' \
            -e "$RSYNC_RSH" "$@"
    else
        rsync -az --delete \
            --exclude='*.qcow2' --exclude='*.raw' --exclude='*.vmdk' \
            --exclude='*.iso' --exclude='*.img' --exclude='*.ova' \
            --exclude='.git' --exclude='target/' --exclude='node_modules/' \
            --exclude='web/node_modules/' --exclude='web/dist/' \
            --exclude='*.tpmstate' --exclude='*.tpmstate/' \
            -e "$RSYNC_RSH" "$@"
    fi
}

check_remote_health() {
    local r="$1"
    deploy_ui_highlight "🩺 Remote health check"
    hr
    info "SSH target → $r"
    ssh_r "$r" env STRICT="$STRICT" HEALTH_URL="$HEALTH_URL" API_PORT="$API_PORT" REMOTE_DIR="$REMOTE_DIR" bash -s <<'EOS'
run() {
    info() { printf 'ℹ️  %s\n' "$*"; }
    ok()   { printf '✅ %s\n' "$*"; }
    warn() { printf '⚠️  %s\n' "$*"; }
    unit_line() {
        local n="$1" a e
        a=$(systemctl is-active "$n" 2>/dev/null) || a="unknown"
        e=$(systemctl is-enabled "$n" 2>/dev/null) || e="unknown"
        printf '  %-28s active=%-12s enabled=%s\n' "$n" "$a" "$e"
    }
    if ! command -v systemctl &>/dev/null; then warn "no systemctl"; exit 1; fi
    printf '\n⚙️  Systemd units\n'
    unit_line zyvor-fabricd.service
    unit_line systemd-machined.service
    local vd md
    vd=$(systemctl is-active zyvor-fabricd 2>/dev/null || true)
    md=$(systemctl is-active systemd-machined 2>/dev/null || true)
    [[ "$vd" == active ]] && ok "zyvor-fabricd active" || warn "zyvor-fabricd not active ($vd)"
    [[ "$md" == active ]] && ok "systemd-machined active" || warn "systemd-machined not active ($md)"
    printf '\n📋 systemctl status zyvor-fabricd\n'
    systemctl status zyvor-fabricd --no-pager 2>/dev/null || warn "cannot read zyvor-fabricd status"
    printf '\n💚 %s\n' "$HEALTH_URL"
    if command -v curl &>/dev/null; then
        curl -skf --connect-timeout 3 "$HEALTH_URL" >/dev/null && ok "GET $HEALTH_URL" || warn "cannot reach $HEALTH_URL"
    else
        warn "curl missing — skip HTTP check"
    fi
    ctl="${REMOTE_DIR:-$HOME/zyvor-fabric}/zyvor-fabricd-ctl"
    if [[ -x "$ctl" ]]; then
        printf '\n🧪 zyvor-fabricd-ctl verify\n'
        ZYVOR_FABRICD_URL="https://127.0.0.1:${API_PORT}" "$ctl" verify 2>/dev/null && ok "verify passed" || warn "verify failed (check admin password / service logs)"
    fi
    printf '\n'
}
run
EOS
}

MODE=deploy
[[ "${1:-}" == check ]] && { MODE=check; shift; }

SKIP_INSTALL=false
QUICK=false
CLEANUP=false
UNINSTALL=false
BIND=""
OPEN_FW=false
NO_START=false
DEPS_ONLY=false
REMOTE_BUILD=false
REMOTE_CHECK=false
DRY_RUN=false
RUN_E2E=false
VERIFY_APIS=false

parse_flags() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --sync-only) SKIP_INSTALL=true; shift ;;
            --quick) QUICK=true; shift ;;
            --e2e) RUN_E2E=true; shift ;;
            --verify-apis) VERIFY_APIS=true; shift ;;
            --cleanup) CLEANUP=true; shift ;;
            --uninstall) UNINSTALL=true; shift ;;
            --open-firewall) OPEN_FW=true; shift ;;
            --no-start) NO_START=true; shift ;;
            --deps-only) DEPS_ONLY=true; shift ;;
            --remote-build) REMOTE_BUILD=true; SKIP_INSTALL=true; shift ;;
            --remote-check) REMOTE_CHECK=true; SKIP_INSTALL=true; shift ;;
            --dry-run) DRY_RUN=true; shift ;;
            --bind) shift; BIND="${1:?}"; shift ;;
            *) REST+=("$1"); shift ;;
        esac
    done
}

if [[ "$MODE" == check ]]; then
    case $# in
        0) die "check: pass USER@HOST or USER HOST" ;;
        1) [[ "$1" == *@* ]] || die "check: pass USER@HOST or two args USER HOST"; check_remote_health "$1" ;;
        2) check_remote_health "${1}@${2}" ;;
        *) die "check: too many arguments" ;;
    esac
    exit 0
fi

if [[ $# -eq 0 ]]; then
    if vmspawn_load_deploy_last "$REPO"; then
        set -- "${USER}@${HOST}"
        ok "Using .deploy-last → ${USER}@${HOST}"
    elif [[ -n "${DEPLOY_HOST:-}" ]]; then
        set -- "${DEPLOY_USER:-root}" "$DEPLOY_HOST"
    fi
fi

if [[ $# -ge 1 && "$1" == *@* ]]; then
    REMOTE="$1"; USER="${1%%@*}"; HOST="${1#*@}"; shift
    parse_flags "$@"
elif [[ $# -ge 2 ]]; then
    if [[ "$1" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] && [[ ! "$2" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
        USER="$2"
        HOST="$1"
        deploy_ui_target_swap "$USER" "$HOST"
    else
        USER="$1"
        HOST="$2"
    fi
    shift 2
    [[ $# -gt 0 && "${1:-}" != -* ]] && { export SSHPASS="$1"; shift; }
    parse_flags "$@"
else
    die "need USER@HOST or USER HOST (deploy-remote.sh --help)"
fi

REMOTE="${USER}@${HOST}"
SUDO="$(vmspawn_sudo_prefix_for_user "$USER")"
REMOTE_DIR="$(vmspawn_remote_dir_for_user "$USER")"

if [[ -z "$BIND" ]] && [[ "$HOST" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] && [[ "$HOST" != "127.0.0.1" ]]; then
    BIND="0.0.0.0"
    OPEN_FW=true
    tip "Remote IPv4 deploy: using --bind 0.0.0.0 --open-firewall (override with --bind 127.0.0.1)"
fi

HEALTH_URL="${HEALTH_URL/127.0.0.1/${HOST}}"

[[ -f "$REPO/backend/Cargo.toml" ]] || die "run from zyvor-fabric repo root"
[[ -n "${SSHPASS:-}" ]] && ! command -v sshpass &>/dev/null && die "install sshpass for password auth"
command -v rsync &>/dev/null || die "rsync required"

if $UNINSTALL; then
    deploy_ui_uninstall_banner
    deploy_ui_kv "🎯" "Target" "$REMOTE"
    deploy_ui_kv "📁" "Remote dir" "$REMOTE_DIR"
    phase 1 1 "Uninstall zyvor-fabricd" "stop services · remove binaries · keep /var/lib/zyvor-fabricd"
    ssh_r_bash "$REMOTE" "
set -euo pipefail
SUDO='${SUDO}'
REMOTE_DIR='${REMOTE_DIR}'
for svc in zyvor-fabricd.service; do
  \$SUDO systemctl stop \$svc 2>/dev/null || true
  \$SUDO systemctl disable \$svc 2>/dev/null || true
done
for unit in zyvor-fabricd.service vm@.service zyvor-fabricd-backup.service zyvor-fabricd-backup.timer zyvor-fabricd-cleanup.service zyvor-fabricd-cleanup.timer; do
  \$SUDO rm -f /usr/lib/systemd/system/\$unit 2>/dev/null || true
done
for bin in zyvor-fabricd zyvorctl zyvorctl-tui zyvorctl; do
  \$SUDO rm -f /usr/bin/\$bin 2>/dev/null || true
done
\$SUDO rm -rf /usr/share/zyvor-fabricd 2>/dev/null || true
\$SUDO rm -rf /etc/zyvor-fabricd 2>/dev/null || true
rm -rf \"\$REMOTE_DIR\"
\$SUDO systemctl daemon-reload
echo 'Done'
" || die "uninstall failed"
    ok "zyvor-fabricd removed from ${HOST}"
    tip "Kept: /var/lib/zyvor-fabricd (user data, images, auth.db)"
    exit 0
fi

if [[ -n "${SSHPASS:-}" ]]; then
    info "SSH auth: 🔑 password (SSHPASS / sshpass)"
else
    info "SSH auth: 🗝️  keys or agent"
fi

deploy_ui_spinner_start "Connecting to ${REMOTE}…"
REMOTE_HOSTNAME="$(ssh_r_bash "$REMOTE" 'hostname')" || { deploy_ui_spinner_stop; die "cannot SSH to $REMOTE"; }
deploy_ui_spinner_stop
ok "Connected — 🖥️  ${REMOTE_HOSTNAME} (${REMOTE})"

if [[ "$USER" != "root" ]]; then
    if ssh_r_bash "$REMOTE" "sudo -n true" 2>/dev/null; then
        DEPLOY_SSH_TTY_OPTS=()
        ok "Passwordless sudo — 🔓 non-TTY SSH for long installs"
    else
        DEPLOY_SSH_TTY_OPTS=(-tt)
    fi
fi

MODE_LABEL="Full install — system deps + build + systemd + web"
if $REMOTE_CHECK; then MODE_LABEL="Compile check — cargo check (no install)"; fi
if $REMOTE_BUILD; then MODE_LABEL="Compile — cargo build --release (no install)"; fi
if $DEPS_ONLY; then MODE_LABEL="System deps only"; fi
if [[ "${SYNC_ONLY:-0}" == 1 ]] || ($SKIP_INSTALL && ! $REMOTE_BUILD && ! $REMOTE_CHECK); then
    MODE_LABEL="Sync only — rsync sources + ownership fix"
fi
if $QUICK; then MODE_LABEL="Quick — rsync + build + install (skip system deps)"; fi

TOTAL_STEPS=8
$QUICK && TOTAL_STEPS=7
if $REMOTE_BUILD || $REMOTE_CHECK; then TOTAL_STEPS=3
elif [[ "${SYNC_ONLY:-0}" == 1 ]] || ($SKIP_INSTALL && ! $REMOTE_BUILD && ! $REMOTE_CHECK); then TOTAL_STEPS=2
elif $DEPS_ONLY; then TOTAL_STEPS=3
fi

OPTS_LINE=""
[[ -n "$BIND" ]] && OPTS_LINE+="--bind $BIND  "
$OPEN_FW && OPTS_LINE+="--open-firewall  "
$NO_START && OPTS_LINE+="--no-start  "
$DEPS_ONLY && OPTS_LINE+="--deps-only  "
$CLEANUP && OPTS_LINE+="cleanup deploy dir after  "

DEPLOY_T0=$SECONDS
banner_deploy "$HOST" "$USER" "$REMOTE_DIR" "$MODE_LABEL"
[[ -n "${OPTS_LINE// /}" ]] && tip "Options: ${OPTS_LINE%  }"

if $DRY_RUN; then
    deploy_ui_dry_run "$HOST" "$USER" "$REMOTE_DIR" "$QUICK"
    $REMOTE_BUILD && deploy_ui_note "Mode: --remote-build"
    $REMOTE_CHECK && deploy_ui_note "Mode: --remote-check"
    exit 0
fi

phase 1 "$TOTAL_STEPS" "Synchronize sources to remote" "rsync · excludes target/, node_modules/, .git/, web/dist/"
ssh_r_bash "$REMOTE" "mkdir -p $REMOTE_DIR"
if ! rsync_r "$REPO/" "$REMOTE:$REMOTE_DIR/"; then
    rc=$?
    if [[ "$rc" -eq 23 ]]; then
        warn "Some files skipped (permission denied) — continuing"
    else
        die "rsync failed with exit code $rc"
    fi
fi
ok "Sources synced → ${REMOTE}:${REMOTE_DIR}"

phase 2 "$TOTAL_STEPS" "Ensure deploy tree is writable" "sudo chown → SSH user (idempotent)"
ssh_r_bash "$REMOTE" "cd $REMOTE_DIR && ${SUDO:+$SUDO }chown -R \"\$(id -un):\$(id -gn)\" ." || warn "chown deploy tree failed (non-fatal if you are not sudo-capable)"

remote_cargo_env='
export PATH="${HOME}/.cargo/bin:/usr/local/cargo/bin:/usr/local/bin:/usr/bin:${PATH}"
if [ -z "${LIBCLANG_PATH:-}" ]; then
    if command -v llvm-config >/dev/null 2>&1; then
        _maj="$(llvm-config --version 2>/dev/null | cut -d. -f1 || true)"
        if [ -n "$_maj" ] && [ -d "/usr/lib64/llvm${_maj}/lib64" ]; then
            export LIBCLANG_PATH="/usr/lib64/llvm${_maj}/lib64"
        fi
    fi
    if [ -z "${LIBCLANG_PATH:-}" ] && [ -d /usr/lib64/llvm20/lib64 ]; then
        export LIBCLANG_PATH=/usr/lib64/llvm20/lib64
    fi
fi
'

if $REMOTE_BUILD || $REMOTE_CHECK; then
    mk_target=build
    cargo_cmd="cargo build --release -p zyvor-fabricd -p zyvorctl"
    $REMOTE_CHECK && { mk_target=check; cargo_cmd="cargo check -p zyvor-fabricd -p zyvorctl"; }
    phase 3 "$TOTAL_STEPS" "Compile on remote ($mk_target)" "no install — run full deploy to install binaries"
    ssh_r_bash "$REMOTE" "
set -euo pipefail
cd $REMOTE_DIR/backend
$remote_cargo_env
if ! command -v cargo >/dev/null 2>&1; then
    echo 'cargo not on PATH — install Rust first (full deploy or --deps-only).' >&2
    exit 1
fi
[ -n \"\${LIBCLANG_PATH:-}\" ] && printf 'ℹ  LIBCLANG_PATH=%s\n' \"\$LIBCLANG_PATH\"
$cargo_cmd
" || die "remote compile failed"
    ok "Remote compile finished — run without --remote-build/--remote-check to install"
    vmspawn_save_deploy_last "$REPO" "$HOST" "$USER" "remote-${mk_target}"
    hr
    deploy_ui_celebrate "Compile finished in $(elapsed_fmt $((SECONDS - DEPLOY_T0)))"
    tip "Next: ./scripts/deploy remote ${USER}@${HOST} --quick"
    exit 0
fi

if [[ "${SYNC_ONLY:-0}" == 1 ]] || $SKIP_INSTALL; then
    vmspawn_save_deploy_last "$REPO" "$HOST" "$USER" "sync-only"
    hr
    deploy_ui_celebrate "Sync finished in $(elapsed_fmt $((SECONDS - DEPLOY_T0)))"
    tip "Sources live on the server under ${REMOTE_DIR} — run full deploy when ready."
    exit 0
fi

install_step=3
if ! $QUICK && ! $DEPS_ONLY; then
    phase "$install_step" "$TOTAL_STEPS" "Remove old binaries" "stop zyvor-fabricd · remove previous /usr/bin installs"
    ssh_r_bash "$REMOTE" "
set -euo pipefail
SUDO='${SUDO}'
\$SUDO systemctl stop zyvor-fabricd.service 2>/dev/null || true
for bin in zyvor-fabricd zyvorctl zyvorctl-tui; do
  \$SUDO rm -f /usr/bin/\$bin 2>/dev/null || true
done
" || warn "could not remove old binaries"
    ok "Old binaries removed"
    install_step=$((install_step + 1))
fi

if ! $QUICK; then
    phase "$install_step" "$TOTAL_STEPS" "Install system dependencies" "Rust toolchain · qemu · machined · build headers"
    ssh_r_bash "$REMOTE" "
set -euo pipefail
SUDO='${SUDO}'
DISTRO_ID=\"\$(. /etc/os-release 2>/dev/null && echo \"\$ID\")\"
IS_APT=0
if [[ \"\$DISTRO_ID\" == debian || \"\$DISTRO_ID\" == ubuntu ]] && command -v apt-get &>/dev/null; then
    \$SUDO apt-get update -qq
    PKG=\"\$SUDO apt-get -y install\"
    IS_APT=1
elif command -v dnf &>/dev/null; then
    PKG=\"\$SUDO dnf -y install\"
elif command -v apt-get &>/dev/null; then
    \$SUDO apt-get update -qq
    PKG=\"\$SUDO apt-get -y install\"
    IS_APT=1
else
    echo 'ERROR: no package manager found' >&2
    exit 1
fi
if ! command -v cargo &>/dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
if [ \"\$IS_APT\" = 1 ]; then
    \$PKG systemd-container qemu-utils 2>&1 | tail -3
    \$PKG gcc libssl-dev libpam0g-dev libdbus-1-dev libsystemd-dev clang 2>&1 | tail -1 || true
    \$PKG qemu-system-x86 ovmf 2>&1 | tail -1 || true
else
    \$PKG systemd-container qemu-img 2>&1 | tail -3
    \$PKG gcc openssl-devel pam-devel dbus-devel systemd-devel clang-devel 2>&1 | tail -1 || true
    \$PKG qemu-system-x86 edk2-ovmf 2>&1 | tail -1 || true
fi
echo 'System deps installed'
" || die "system deps install failed"
    ok "System dependencies installed"
    install_step=$((install_step + 1))
    if $DEPS_ONLY; then
        vmspawn_save_deploy_last "$REPO" "$HOST" "$USER" "deps-only"
        deploy_ui_celebrate "Deps installed in $(elapsed_fmt $((SECONDS - DEPLOY_T0)))"
        exit 0
    fi
elif ! $DEPS_ONLY; then
    phase "$install_step" "$TOTAL_STEPS" "Remove old binaries" "stop zyvor-fabricd · remove previous /usr/bin installs"
    ssh_r_bash "$REMOTE" "
set -euo pipefail
SUDO='${SUDO}'
\$SUDO systemctl stop zyvor-fabricd.service 2>/dev/null || true
for bin in zyvor-fabricd zyvorctl zyvorctl-tui; do
  \$SUDO rm -f /usr/bin/\$bin 2>/dev/null || true
done
" || warn "could not remove old binaries"
    ok "Old binaries removed"
    install_step=$((install_step + 1))
fi

phase "$install_step" "$TOTAL_STEPS" "Build Rust binaries on remote" "cargo build --release -p zyvor-fabricd -p zyvorctl"
ssh_r_bash "$REMOTE" "
set -euo pipefail
cd $REMOTE_DIR/backend
$remote_cargo_env
cargo build --release -p zyvor-fabricd -p zyvorctl
" || die "Rust build failed"
ok "Rust binaries built"
install_step=$((install_step + 1))

phase "$install_step" "$TOTAL_STEPS" "Install binaries and systemd units" "config · directories · zyvorctl · restart service"
ssh_r_bash "$REMOTE" "
set -euo pipefail
SUDO='${SUDO}'
REMOTE_DIR='${REMOTE_DIR}'
BIND='${BIND}'
OPEN_FW='${OPEN_FW}'
NO_START='${NO_START}'
API_PORT='${API_PORT}'
cd \"\$REMOTE_DIR\"

for bin in zyvor-fabricd zyvorctl zyvorctl-tui; do
    if [ -f \"backend/target/release/\$bin\" ]; then
        \$SUDO install -m 755 \"backend/target/release/\$bin\" \"/usr/bin/\$bin\"
        echo \"  ✅ \$bin -> /usr/bin/\$bin\"
    fi
done
[ -f zyvorctl ] && \$SUDO install -m 755 zyvorctl /usr/bin/zyvorctl && echo '  ✅ zyvorctl -> /usr/bin/zyvorctl'

\$SUDO install -d /etc/zyvor-fabricd /var/lib/zyvor-fabricd/images /var/lib/zyvor-fabricd/state /var/log/zyvor-fabricd /run/zyvor-fabricd

if [ ! -f /etc/zyvor-fabricd/zyvor-fabricd.toml ] && [ -f configs/zyvor-fabricd.toml ]; then
    \$SUDO install -m 0644 configs/zyvor-fabricd.toml /etc/zyvor-fabricd/zyvor-fabricd.toml
    echo '  ✅ Created /etc/zyvor-fabricd/zyvor-fabricd.toml'
fi

if [ -n \"\$BIND\" ] && [ -f /etc/zyvor-fabricd/zyvor-fabricd.toml ]; then
    \$SUDO sed -i \"s/listen = \\\"127.0.0.1:/listen = \\\"\${BIND}:/\" /etc/zyvor-fabricd/zyvor-fabricd.toml
    \$SUDO sed -i \"s/listen = \\\"0.0.0.0:/listen = \\\"\${BIND}:/\" /etc/zyvor-fabricd/zyvor-fabricd.toml
    echo \"  ✅ listen bound to \${BIND}:\${API_PORT}\"
fi

for unit in zyvor-fabricd.service; do
    [ -f \"systemd/\$unit\" ] && \$SUDO install -m 644 \"systemd/\$unit\" \"/usr/lib/systemd/system/\$unit\"
done
if [ -f configs/pam.d/zyvor-fabricd ]; then
    \$SUDO install -m 644 configs/pam.d/zyvor-fabricd /etc/pam.d/zyvor-fabricd
    echo '  ✅ PAM service -> /etc/pam.d/zyvor-fabricd'
fi

\$SUDO systemctl daemon-reload
if [ \"\$NO_START\" != true ]; then
    \$SUDO systemctl enable zyvor-fabricd.service 2>/dev/null || true
    \$SUDO systemctl restart zyvor-fabricd.service 2>/dev/null || true
    sleep 2
    if \$SUDO systemctl is-active zyvor-fabricd &>/dev/null; then
        echo '  ✅ zyvor-fabricd: running'
    else
        echo '  ❌ zyvor-fabricd: not running (journalctl -u zyvor-fabricd -n 20)'
    fi
else
    echo '  ℹ️  --no-start: service not restarted'
fi

if [ \"\$OPEN_FW\" = true ] && command -v firewall-cmd &>/dev/null; then
    \$SUDO firewall-cmd --permanent --add-port=\${API_PORT}/tcp 2>/dev/null || true
    \$SUDO firewall-cmd --reload 2>/dev/null || true
    echo \"  ✅ firewalld: opened port \${API_PORT}/tcp\"
fi
" || die "install failed"
ok "Binaries and systemd installed"
install_step=$((install_step + 1))

phase "$install_step" "$TOTAL_STEPS" "Deploy web dashboard" "npm install · npm run build · /usr/share/zyvor-fabricd/web"
ssh_r_bash "$REMOTE" "
set -euo pipefail
SUDO='${SUDO}'
REMOTE_DIR='${REMOTE_DIR}'
cd \"\$REMOTE_DIR\"
if [ -f web/package.json ] && command -v npm &>/dev/null; then
    cd web
    npm install --silent 2>&1 | tail -1
    npm run build 2>&1 | tail -3
    cd \"\$REMOTE_DIR\"
    if [ -d web/dist ]; then
        \$SUDO rm -rf /usr/share/zyvor-fabricd/web
        \$SUDO install -d /usr/share/zyvor-fabricd/web
        \$SUDO cp -r web/dist/* /usr/share/zyvor-fabricd/web/
        echo \"  ✅ Dashboard deployed: \$(find /usr/share/zyvor-fabricd/web -type f | wc -l) files\"
    fi
elif [ -f /usr/share/zyvor-fabricd/web/index.html ]; then
    echo '  ℹ️  Dashboard already deployed'
else
    echo '  ⚠️  npm not found — skipping dashboard build'
fi
" || warn "web dashboard deploy failed"
ok "Web dashboard deployed"
install_step=$((install_step + 1))

phase "$install_step" "$TOTAL_STEPS" "Post-flight verification" "health endpoint · systemd · zyvor-fabricd-ctl verify"
sleep 1
check_remote_health "$REMOTE" || true

if $CLEANUP; then
    warn "Removing remote deploy tree $REMOTE_DIR"
    ssh_r "$REMOTE" "rm -rf $REMOTE_DIR" || warn "cleanup failed"
fi

ELAPSED=$((SECONDS - DEPLOY_T0))
MODE_SAVE=full
$QUICK && MODE_SAVE=quick
vmspawn_save_deploy_last "$REPO" "$HOST" "$USER" "$MODE_SAVE"

deploy_ui_highlight "📋 Post-deploy checklist"
deploy_ui_checklist "zyvor-fabricd" "$(ssh_r_bash "$REMOTE" 'systemctl is-active zyvor-fabricd 2>/dev/null || echo unknown' | tr -d '\r')"
deploy_ui_checklist "machined" "$(ssh_r_bash "$REMOTE" 'systemctl is-active systemd-machined 2>/dev/null || echo unknown' | tr -d '\r')"
deploy_ui_checklist "health" "$(curl -skf --connect-timeout 5 "https://${HOST}:${API_PORT}/health" >/dev/null && echo 200 || echo fail)"

deploy_ui_celebrate "Ship it!"
vmspawn_print_success "$HOST" "$ELAPSED" "$USER"
deploy_ui_kv "🔗" "SSH" "ssh ${USER}@${HOST}"
deploy_ui_kv "🔑" "Password" "sudo cat /var/lib/zyvor-fabricd/.admin_password"
deploy_ui_kv "🚀" "Manage" "zyvor-fabricd-ctl status · zyvor-fabricd-ctl verify"
tip "HOST USER also works: ./scripts/deploy-remote.sh ${HOST} ${USER} --quick"

if $RUN_E2E; then
    deploy_ui_highlight "🧪 Post-deploy E2E"
    if ssh_r_bash "$REMOTE" "ZYVOR_FABRICD_URL=https://127.0.0.1:${API_PORT} ${REMOTE_DIR}/zyvor-fabricd-ctl verify"; then
        deploy_ui_celebrate "E2E passed"
    else
        warn "E2E failed (deploy itself succeeded)"
    fi
fi

if $VERIFY_APIS; then
    deploy_ui_highlight "🔍 UX API audit"
    ADMIN_PW="$(ssh_r_bash "$REMOTE" "sudo cat /var/lib/zyvor-fabricd/.admin_password 2>/dev/null | tr -d '\r'" || true)"
    if [[ -n "$ADMIN_PW" ]] && VMSPAWN_USER=admin VMSPAWN_PASS="$ADMIN_PW" "$REPO/scripts/audit-ux-apis.sh" "http://${HOST}:${API_PORT}"; then
        deploy_ui_celebrate "API audit passed"
    else
        warn "API audit failed (deploy itself succeeded)"
    fi
fi
printf '\n'
