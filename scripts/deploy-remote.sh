#!/bin/bash
# ============================================================================
# deploy-remote.sh — Full vmspawnd deployment to a remote server
# ============================================================================
# One command to fully set up a remote server with vmspawnd:
#   1. Build Rust binaries locally (cross-compile for linux/x86_64)
#   2. Build web dashboard
#   3. Rsync binaries + configs to remote
#   4. Install system deps (systemd-vmspawn, systemd-machined, qemu)
#   5. Install binaries + systemd services
#   6. Deploy web dashboard
#   7. Verify everything works
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
            echo "  --quick      Skip system deps (only build + deploy binaries)"
            echo "  --uninstall  Remove vmspawnd from remote server"
            echo ""
            echo "Full mode installs everything: systemd-vmspawn, systemd-machined,"
            echo "qemu, vmspawnd binaries, systemd services, web dashboard."
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
        --exclude='web/dist/' --exclude='web/node_modules/' \
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

TOTAL_STEPS=7
$QUICK_MODE && TOTAL_STEPS=5

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║     🚀 vmspawnd Remote Deployment                ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""
echo "  Host:     ${USER}@${HOST}"
echo "  Auth:     $([ -n "$PASS" ] && echo "🔑 password" || echo "🔐 SSH key")"
echo "  Local:    $REPO_DIR"
echo "  Remote:   $REMOTE_DIR"
echo "  Mode:     $($QUICK_MODE && echo "⚡ quick (build + deploy only)" || echo "📦 full (system deps + vmspawnd)")"
echo ""

# ── Step 1: Build Rust binaries locally ──
step "Step 1/${TOTAL_STEPS}: 🔨 Building Rust binaries (release)"

cd "$REPO_DIR/backend"
cargo build --release 2>&1 | tail -5
info "Binaries built in backend/target/release/"

# ── Step 2: Build web dashboard ──
step "Step 2/${TOTAL_STEPS}: 🌐 Building web dashboard"

cd "$REPO_DIR/web"
if [ -f "package.json" ]; then
    npm install --silent 2>&1 | tail -1
    npm run build 2>&1 | tail -3
    info "Dashboard built to web/dist/"
else
    warn "package.json not found — skipping dashboard build"
fi
cd "$REPO_DIR"

# ── Step 3: Rsync to remote ──
CURRENT_STEP=3
step "Step ${CURRENT_STEP}/${TOTAL_STEPS}: 📤 Syncing to ${HOST}"

_ssh "mkdir -p $REMOTE_DIR/build $REMOTE_DIR/systemd $REMOTE_DIR/configs $REMOTE_DIR/web-dist"

# Sync binaries
for bin in vmspawnd vmctl vmctl-tui; do
    if [ -f "backend/target/release/$bin" ]; then
        _scp "backend/target/release/$bin" "${USER}@${HOST}:${REMOTE_DIR}/build/$bin"
        info "Synced $bin"
    fi
done

# Sync config + systemd
_rsync "$REPO_DIR/configs/" "${USER}@${HOST}:${REMOTE_DIR}/configs/" 2>&1 | tail -1
_rsync "$REPO_DIR/systemd/" "${USER}@${HOST}:${REMOTE_DIR}/systemd/" 2>&1 | tail -1

# Sync web dashboard
if [ -d "$REPO_DIR/web/dist" ]; then
    _ssh "rm -rf $REMOTE_DIR/web-dist"
    _rsync "$REPO_DIR/web/dist/" "${USER}@${HOST}:${REMOTE_DIR}/web-dist/" 2>&1 | tail -1
fi

info "Synced to ${HOST}:${REMOTE_DIR}"

if ! $QUICK_MODE; then
    # ── Step 4: Install system deps ──
    CURRENT_STEP=4
    step "Step ${CURRENT_STEP}/${TOTAL_STEPS}: 📦 Installing system dependencies"

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

        # Core virtualization (systemd-vmspawn + machined)
        \$PKG systemd-container qemu-img 2>&1 | tail -3

        # Optional tools
        \$PKG qemu-system-x86 edk2-ovmf 2>&1 | tail -1 || true

        # Enable machined
        systemctl enable --now systemd-machined 2>/dev/null || true

        echo 'System deps installed'
    " 2>&1 | grep -E 'installed|enabled|System deps' | head -10
    info "System dependencies installed"

    CURRENT_STEP=5
else
    CURRENT_STEP=4
fi

# ── Install binaries ──
step "Step ${CURRENT_STEP}/${TOTAL_STEPS}: 📦 Installing vmspawnd binaries"

_ssh "
    cd $REMOTE_DIR

    # Install binaries
    for bin in build/*; do
        name=\$(basename \$bin)
        install -m 755 \$bin /usr/bin/\$name
        echo \"  ✅ \$name -> /usr/bin/\$name\"
    done

    # Create directories
    install -d /etc/vmspawnd
    install -d /var/lib/vmspawnd/images
    install -d /var/lib/vmspawnd/state
    install -d /var/log/vmspawnd
    install -d /run/vmspawnd

    # Install config if not exists
    if [ ! -f /etc/vmspawnd/vmspawnd.toml ] && [ -f configs/vmspawnd.toml ]; then
        install -m 0644 configs/vmspawnd.toml /etc/vmspawnd/vmspawnd.toml
        echo '  ✅ Created /etc/vmspawnd/vmspawnd.toml'
    else
        echo '  ℹ️  /etc/vmspawnd/vmspawnd.toml already exists'
    fi

    if [ ! -f /etc/vmspawnd/vmspawnd.env ] && [ -f configs/vmspawnd.env ]; then
        install -m 0640 configs/vmspawnd.env /etc/vmspawnd/vmspawnd.env
    fi
" 2>&1
info "Binaries installed"

# ── Install systemd service ──
CURRENT_STEP=$((CURRENT_STEP + 1))
step "Step ${CURRENT_STEP}/${TOTAL_STEPS}: ⚙️  Installing systemd services"

_ssh "
    cd $REMOTE_DIR

    # Install systemd units
    for unit in vmspawnd.service vm@.service vmspawnd-backup.service vmspawnd-cleanup.service; do
        if [ -f systemd/\$unit ]; then
            install -m 644 systemd/\$unit /usr/lib/systemd/system/\$unit
            echo \"  ✅ Installed \$unit\"
        fi
    done

    # Install socket if available
    if [ -f systemd/vmspawnd.socket ]; then
        install -m 644 systemd/vmspawnd.socket /usr/lib/systemd/system/vmspawnd.socket
        echo '  ✅ Installed vmspawnd.socket'
    fi

    # Install timers
    for timer in vmspawnd-backup.timer vmspawnd-cleanup.timer; do
        if [ -f systemd/\$timer ]; then
            install -m 644 systemd/\$timer /usr/lib/systemd/system/\$timer
            echo \"  ✅ Installed \$timer\"
        fi
    done

    systemctl daemon-reload
    systemctl enable vmspawnd.service 2>/dev/null || true
    systemctl restart vmspawnd.service 2>/dev/null || true

    sleep 2
    if systemctl is-active vmspawnd &>/dev/null; then
        echo '  ✅ vmspawnd: running'
    else
        echo '  ⚠️  vmspawnd: not running (check: journalctl -u vmspawnd -n 10)'
    fi
" 2>&1
info "Systemd services installed"

# ── Deploy web dashboard ──
CURRENT_STEP=$((CURRENT_STEP + 1))
step "Step ${CURRENT_STEP}/${TOTAL_STEPS}: 🌐 Deploying web dashboard"

_ssh "
    WEB_DIST='$REMOTE_DIR/web-dist'

    if [ -d \"\$WEB_DIST\" ] && [ -f \"\$WEB_DIST/index.html\" ]; then
        rm -rf /usr/share/vmspawnd/web
        install -d /usr/share/vmspawnd/web
        cp -r \$WEB_DIST/* /usr/share/vmspawnd/web/
        echo '  ✅ Dashboard deployed to /usr/share/vmspawnd/web/'
        echo \"  📁 Files: \$(find /usr/share/vmspawnd/web -type f | wc -l)\"
    else
        echo '  ⚠️  Dashboard files not found — skipping'
    fi
" 2>&1
info "Web dashboard deployed"

# ── Verify ──
CURRENT_STEP=$((CURRENT_STEP + 1))
step "Step ${CURRENT_STEP}/${TOTAL_STEPS}: ✅ Verifying installation"

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
    for tool in systemd-vmspawn machinectl qemu-img; do
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
            echo \"  📍 \$svc: running\"
        else
            echo \"  ⚠️  \$svc: not running\"
        fi
    done

    echo ''
    echo '  ── Storage ──'
    echo \"  📍 /var/lib/vmspawnd: \$(du -sh /var/lib/vmspawnd 2>/dev/null | cut -f1 || echo 'N/A')\"
    echo \"  📍 /etc/vmspawnd:     \$(ls /etc/vmspawnd/*.toml 2>/dev/null | wc -l) config file(s)\"

    echo ''
    echo '  ── Dashboard ──'
    if [ -d /usr/share/vmspawnd/web ]; then
        echo \"  📍 Dashboard files: \$(find /usr/share/vmspawnd/web -type f | wc -l) files\"
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
echo "    vmctl list"
echo "    vmctl create --name my-vm --image /var/lib/vmspawnd/images/my.qcow2"
echo ""
echo "  🩺 System check:"
echo "    vmctl status"
echo "    systemctl status vmspawnd"
echo "    journalctl -u vmspawnd -f"
echo ""
