#!/bin/bash
# ============================================================================
# deploy-remote.sh — Full vmspawnd deployment to a remote server
# ============================================================================
# One command to fully set up a remote server with vmspawnd:
#   1. Rsync repo to remote
#   2. Remove old installation
#   3. Install system deps (systemd-vmspawn, systemd-machined, qemu)
#   4. Build Rust binaries on remote
#   5. Install binaries + systemd services + web dashboard
#   6. Verify everything works
#
# Usage:
#   ./scripts/deploy-remote.sh <host> [user] [password]
#   ./scripts/deploy-remote.sh 185.165.240.5 root mypassword
#   ./scripts/deploy-remote.sh 10.0.0.1 root                  # SSH key auth
#   ./scripts/deploy-remote.sh 10.0.0.1 root pass --quick     # skip system deps
#   ./scripts/deploy-remote.sh 10.0.0.1 root pass --uninstall # remove vmspawnd
#
# Environment variables:
#   DEPLOY_HOST=185.165.240.5
#   DEPLOY_USER=root
#   DEPLOY_PASS=mypassword
#   DEPLOY_DIR=/root/vmspawn
# ============================================================================

set -euo pipefail

info()  { echo "  ✅ $*"; }
warn()  { echo "  ⚠️  $*"; }
error() { echo "  ❌ $*"; exit 1; }
step()  { echo ""; echo "  🔧 $*"; }

# ── Parse args ──
QUICK_MODE=false
UNINSTALL_MODE=false
POSITIONAL=()
for arg in "$@"; do
    case "$arg" in
        --quick)     QUICK_MODE=true ;;
        --uninstall) UNINSTALL_MODE=true ;;
        --help|-h)
            echo "Usage: $0 <host> [user] [password] [--quick|--uninstall]"
            echo ""
            echo "  --quick      Skip system deps (only rsync + build + deploy)"
            echo "  --uninstall  Remove vmspawnd from remote server"
            echo ""
            echo "Full mode installs everything: systemd-vmspawn, systemd-machined,"
            echo "qemu, Rust, vmspawnd binaries, systemd services, web dashboard."
            exit 0
            ;;
        *)  POSITIONAL+=("$arg") ;;
    esac
done

HOST="${POSITIONAL[0]:-${DEPLOY_HOST:-}}"
USER="${POSITIONAL[1]:-${DEPLOY_USER:-root}}"
PASS="${POSITIONAL[2]:-${DEPLOY_PASS:-}}"
REMOTE_DIR="${DEPLOY_DIR:-/root/vmspawn}"

[ -z "$HOST" ] && error "Usage: $0 <host> [user] [password] [--quick]"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

[ -f "$REPO_DIR/backend/Cargo.toml" ] || error "Not in vmspawn repo: $REPO_DIR"

# ── SSH/rsync wrappers (SSHPASS env var — no password in ps) ──
_ssh() {
    if [ -n "$PASS" ]; then
        SSHPASS="$PASS" sshpass -e ssh -o StrictHostKeyChecking=accept-new "${USER}@${HOST}" "$@"
    else
        ssh -o StrictHostKeyChecking=accept-new "${USER}@${HOST}" "$@"
    fi
}

_scp() {
    if [ -n "$PASS" ]; then
        SSHPASS="$PASS" sshpass -e scp -o StrictHostKeyChecking=accept-new "$@"
    else
        scp -o StrictHostKeyChecking=accept-new "$@"
    fi
}

_rsync() {
    local ssh_cmd="ssh -o StrictHostKeyChecking=accept-new"
    if [ -n "$PASS" ]; then
        ssh_cmd="sshpass -e $ssh_cmd"
    fi
    SSHPASS="$PASS" rsync -avz \
        --exclude='*.qcow2' --exclude='*.raw' --exclude='*.vmdk' \
        --exclude='*.iso' --exclude='*.img' --exclude='*.ova' \
        --exclude='.git' --exclude='target/' --exclude='node_modules/' \
        --exclude='web/node_modules/' --exclude='web/dist/' \
        --exclude='web/dist/' --exclude='web/node_modules/' \
        --exclude='*.tpmstate' --exclude='*.tpmstate/' \
        -e "$ssh_cmd" \
        "$@"
}

# ── Preflight ──
if [ -n "$PASS" ] && ! command -v sshpass &>/dev/null; then
    error "sshpass required for password auth. Install: dnf install sshpass"
fi

# ── Uninstall mode ──
if $UNINSTALL_MODE; then
    echo ""
    echo "  ╔══════════════════════════════════════════════════╗"
    echo "  ║     🗑️  vmspawnd Remote Uninstall                ║"
    echo "  ╚══════════════════════════════════════════════════╝"
    echo ""
    echo "  Host: ${USER}@${HOST}"
    echo ""

    step "Uninstalling vmspawnd"
    _ssh "
        # Stop and disable services
        systemctl stop vmspawnd.service 2>/dev/null || true
        systemctl stop vmspawnd.socket 2>/dev/null || true
        systemctl disable vmspawnd.service 2>/dev/null || true
        systemctl disable vmspawnd.socket 2>/dev/null || true
        rm -f /usr/lib/systemd/system/vmspawnd.service
        rm -f /usr/lib/systemd/system/vmspawnd.socket
        rm -f /usr/lib/systemd/system/vm@.service
        rm -f /usr/lib/systemd/system/vmspawnd-backup.service
        rm -f /usr/lib/systemd/system/vmspawnd-backup.timer
        rm -f /usr/lib/systemd/system/vmspawnd-cleanup.service
        rm -f /usr/lib/systemd/system/vmspawnd-cleanup.timer

        # Remove binaries
        for bin in vmspawnd vmctl vmctl-tui vmspawnctl; do
            rm -f /usr/bin/\$bin 2>/dev/null || true
        done

        # Remove repo
        rm -rf $REMOTE_DIR

        # Remove web UI
        rm -rf /usr/share/vmspawnd 2>/dev/null || true

        # Remove config (keep data)
        rm -rf /etc/vmspawnd 2>/dev/null || true

        systemctl daemon-reload

        echo 'Done'
    " 2>&1 | grep -v "^WARNING" || true

    info "vmspawnd removed from ${HOST}"
    echo ""
    echo "  📁 Kept: /var/lib/vmspawnd (user data, images)"
    echo "  📁 Kept: system packages (systemd, qemu, etc)"
    echo ""
    exit 0
fi

TOTAL_STEPS=6
$QUICK_MODE && TOTAL_STEPS=4

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║     🚀 vmspawnd Remote Deployment                ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""
echo "  Host:     ${USER}@${HOST}"
echo "  Auth:     $([ -n "$PASS" ] && echo "🔑 password" || echo "🔐 SSH key")"
echo "  Local:    $REPO_DIR"
echo "  Remote:   $REMOTE_DIR"
echo "  Mode:     $($QUICK_MODE && echo "⚡ quick (rsync + build only)" || echo "📦 full (system deps + vmspawnd)")"
echo ""

# ── Step 1: Rsync repo ──
step "Step 1/${TOTAL_STEPS}: 📤 Syncing repository to ${HOST}"

# rsync exit code 23 = partial transfer (permission-denied files) — acceptable
_rsync "$REPO_DIR/" "${USER}@${HOST}:${REMOTE_DIR}/" 2>&1 | tail -3 || {
    rc=$?
    if [ "$rc" -eq 23 ]; then
        warn "Some files skipped (permission denied) — continuing"
    else
        error "rsync failed with exit code $rc"
    fi
}
info "Synced to ${HOST}:${REMOTE_DIR}"

if ! $QUICK_MODE; then
    # ── Step 2: Remove old installation ──
    step "Step 2/${TOTAL_STEPS}: 🗑️  Removing old vmspawnd"

    _ssh "
        systemctl stop vmspawnd.service 2>/dev/null || true
        for bin in vmspawnd vmctl vmctl-tui; do
            rm -f /usr/bin/\$bin 2>/dev/null || true
        done
    " 2>&1 | grep -v "^WARNING" || true
    info "Old version removed"

    # ── Step 3: Install system deps ──
    step "Step 3/${TOTAL_STEPS}: 📦 Installing system dependencies"

    _ssh "
        # Detect package manager
        if command -v dnf &>/dev/null; then
            PKG='dnf -y install'
        elif command -v apt-get &>/dev/null; then
            apt-get update -qq
            PKG='apt-get -y install'
        else
            echo 'ERROR: no package manager found'
            exit 1
        fi

        # Core: Rust toolchain
        if ! command -v cargo &>/dev/null; then
            curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y 2>&1 | tail -1
            source \"\$HOME/.cargo/env\"
        fi

        # Core: systemd-vmspawn + machined + qemu
        \$PKG systemd-container qemu-img 2>&1 | tail -3

        # Build deps
        \$PKG gcc openssl-devel pam-devel dbus-devel systemd-devel 2>&1 | tail -1 || true
        \$PKG gcc libssl-dev libpam0g-dev libdbus-1-dev libsystemd-dev 2>&1 | tail -1 || true

        # Optional: full QEMU + UEFI
        \$PKG qemu-system-x86 edk2-ovmf 2>&1 | tail -1 || true

        # Enable machined
        systemctl enable --now systemd-machined 2>/dev/null || true

        echo 'System deps installed'
    " 2>&1 | grep -E 'installed|enabled|System deps|Rust is installed' | head -10
    info "System dependencies installed"

    # ── Step 4: Build + install ──
    step "Step 4/${TOTAL_STEPS}: 🔨 Building and installing vmspawnd"
else
    # Quick mode: uninstall old + build
    step "Step 2/${TOTAL_STEPS}: 🗑️  Removing old vmspawnd"

    _ssh "
        systemctl stop vmspawnd.service 2>/dev/null || true
        for bin in vmspawnd vmctl vmctl-tui; do
            rm -f /usr/bin/\$bin 2>/dev/null || true
        done
    " 2>&1 | grep -v "^WARNING" || true
    info "Old version removed"

    step "Step 3/${TOTAL_STEPS}: 🔨 Building and installing vmspawnd"
fi

# ── Build Rust binaries on remote ──
_ssh "
    source \"\$HOME/.cargo/env\" 2>/dev/null || true
    cd $REMOTE_DIR/backend
    cargo build --release 2>&1 | tail -5
" 2>&1 | tail -5
info "Rust binaries built"

# ── Install binaries ──
_ssh "
    cd $REMOTE_DIR

    # Install binaries
    for bin in vmspawnd vmctl vmctl-tui; do
        if [ -f backend/target/release/\$bin ]; then
            install -m 755 backend/target/release/\$bin /usr/bin/\$bin
            echo \"  ✅ \$bin -> /usr/bin/\$bin\"
        fi
    done

    # Install vmspawnctl helper
    if [ -f vmspawnctl ]; then
        install -m 755 vmspawnctl /usr/bin/vmspawnctl
        echo '  ✅ vmspawnctl -> /usr/bin/vmspawnctl'
    fi

    # Create directories
    install -d /etc/vmspawnd
    install -d /var/lib/vmspawnd/images
    install -d /var/lib/vmspawnd/state
    install -d /var/log/vmspawnd
    install -d /run/vmspawnd

    # Install config if not exists
    if [ ! -f /etc/vmspawnd/vmspawnd.toml ] && [ -f configs/vmspawnd.toml ]; then
        install -m 0644 configs/vmspawnd.toml /etc/vmspawnd/vmspawnd.toml
        # Bind to all interfaces for remote access
        sed -i 's/listen = \"127.0.0.1:/listen = \"0.0.0.0:/' /etc/vmspawnd/vmspawnd.toml
        echo '  ✅ Created /etc/vmspawnd/vmspawnd.toml (listening on 0.0.0.0)'
    else
        echo '  ℹ️  /etc/vmspawnd/vmspawnd.toml already exists'
    fi
" 2>&1
info "Binaries installed"

# ── Install systemd services ──
_ssh "
    cd $REMOTE_DIR

    # Install systemd units
    for unit in vmspawnd.service vm@.service vmspawnd-backup.service vmspawnd-cleanup.service; do
        if [ -f systemd/\$unit ]; then
            install -m 644 systemd/\$unit /usr/lib/systemd/system/\$unit
        fi
    done

    # Install socket + timers
    for extra in vmspawnd.socket vmspawnd-backup.timer vmspawnd-cleanup.timer; do
        if [ -f systemd/\$extra ]; then
            install -m 644 systemd/\$extra /usr/lib/systemd/system/\$extra
        fi
    done

    systemctl daemon-reload
    systemctl enable vmspawnd.service 2>/dev/null || true
    systemctl restart vmspawnd.service 2>/dev/null || true

    sleep 2
    if systemctl is-active vmspawnd &>/dev/null; then
        echo '  ✅ vmspawnd: running'
    else
        echo '  ❌ vmspawnd: not running (check: journalctl -u vmspawnd -n 10)'
    fi
" 2>&1
info "Systemd services installed"

# ── Deploy web dashboard ──
if $QUICK_MODE; then
    DEPLOY_STEP=4
else
    DEPLOY_STEP=5
fi
step "Step ${DEPLOY_STEP}/${TOTAL_STEPS}: 🌐 Deploying web dashboard"

_ssh "
    cd $REMOTE_DIR

    # Build web dashboard if npm is available
    WEB_DIR=''
    for dir in web; do
        if [ -f \$dir/package.json ]; then
            WEB_DIR=\$dir
            break
        fi
    done

    if [ -n \"\$WEB_DIR\" ] && command -v npm &>/dev/null; then
        cd \$WEB_DIR
        npm install --silent 2>&1 | tail -1
        npm run build 2>&1 | tail -3
        cd $REMOTE_DIR

        # Deploy built files
        if [ -d \$WEB_DIR/dist ]; then
            rm -rf /usr/share/vmspawnd/web
            install -d /usr/share/vmspawnd/web
            cp -r \$WEB_DIR/dist/* /usr/share/vmspawnd/web/
            echo \"  ✅ Dashboard deployed: \$(find /usr/share/vmspawnd/web -type f | wc -l) files\"
        fi
    elif [ -d /usr/share/vmspawnd/web/index.html ]; then
        echo '  ℹ️  Dashboard already deployed'
    else
        echo '  ⚠️  npm not found — skipping dashboard build'
        echo '  ℹ️  Install Node.js: dnf install nodejs npm'
    fi
" 2>&1
info "Web dashboard deployed"

# ── Verify ──
if $QUICK_MODE; then
    VERIFY_STEP=$TOTAL_STEPS
else
    VERIFY_STEP=$TOTAL_STEPS
fi
step "Step ${VERIFY_STEP}/${TOTAL_STEPS}: ✅ Verifying installation"

_ssh "
    echo ''
    echo '  ── Binaries ──'
    for bin in vmspawnd vmctl vmctl-tui vmspawnctl; do
        if command -v \$bin &>/dev/null; then
            ver=\$(\$bin --version 2>/dev/null || echo 'installed')
            echo \"  📍 \$bin: \$ver\"
        fi
    done

    echo ''
    echo '  ── System tools ──'
    for tool in systemd-vmspawn machinectl qemu-img cargo; do
        if command -v \$tool &>/dev/null; then
            echo \"  📍 \$tool: \$(command -v \$tool)\"
        else
            echo \"  ⚠️  \$tool: not found\"
        fi
    done

    echo ''
    echo '  ── Services ──'
    for svc in vmspawnd systemd-machined; do
        if systemctl is-active \$svc &>/dev/null; then
            echo \"  ✅ \$svc: running\"
        else
            echo \"  ❌ \$svc: not running\"
        fi
    done

    echo ''
    echo '  ── Storage ──'
    echo \"  📍 /var/lib/vmspawnd: \$(du -sh /var/lib/vmspawnd 2>/dev/null | cut -f1 || echo 'N/A')\"
    echo \"  📍 /etc/vmspawnd:     \$(ls /etc/vmspawnd/*.toml 2>/dev/null | wc -l) config file(s)\"

    # Check API
    echo ''
    echo '  ── API ──'
    if curl -sf http://localhost:9095/api/health &>/dev/null; then
        echo '  ✅ API: http://localhost:9095 responding'
    else
        echo '  ⚠️  API: http://localhost:9095 not responding'
    fi

    echo ''
    echo '  ── Dashboard ──'
    if [ -d /usr/share/vmspawnd/web ] && [ -f /usr/share/vmspawnd/web/index.html ]; then
        echo \"  ✅ Dashboard: \$(find /usr/share/vmspawnd/web -type f | wc -l) files\"
    else
        echo '  ⚠️  Dashboard not deployed'
    fi
" 2>&1

echo ""
echo "  ════════════════════════════════════════════════════"
echo "  🎉 Deployment complete: ${USER}@${HOST}"
echo "  ════════════════════════════════════════════════════"
echo ""
echo "  🔗 Connect:"
echo "    ssh ${USER}@${HOST}"
echo ""
echo "  🌐 Web Dashboard:"
echo "    http://${HOST}:9095/"
echo ""
echo "  🚀 Manage VMs:"
echo "    vmspawnctl status"
echo "    vmspawnctl list"
echo "    vmspawnctl create --name my-vm --image /var/lib/vmspawnd/images/my.qcow2"
echo ""
echo "  🩺 System check:"
echo "    systemctl status vmspawnd"
echo "    journalctl -u vmspawnd -f"
echo ""
