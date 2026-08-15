#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
#
# Zyvor Fabric One-Shot Setup Script (vmspawnd)
#
# Downloads dependencies, builds, installs, starts daemon, and runs verification.
# Works on fresh Fedora, RHEL, Ubuntu, and Debian systems.
#
# Usage:
#   sudo ./setup.sh                          # Full setup + start
#   sudo ./setup.sh --no-start              # Don't start daemon
#   sudo ./setup.sh --dev                   # Also install dev tools
#   sudo ./setup.sh --prefix /opt/vmspawnd  # Custom install path

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
VMSPAWND_VERSION="0.1.0"
RUST_MIN_VERSION="1.80"
INSTALL_PREFIX="/usr"
START_DAEMON=true
DEV_MODE=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()    { echo "ℹ️ [INFO]  $*"; }
warn()    { echo "⚠️ [WARN]  $*"; }
err()     { echo "❌ [ERROR] $*" >&2; }
step()    { echo ""; echo "🔹 >>> $*"; }
success() { echo "✅ [OK]    $*"; }

die() { err "$@"; exit 1; }

need_root() {
    if [[ $EUID -ne 0 ]]; then
        die "This script must be run as root (use: sudo ./setup.sh)"
    fi
}

# Detect OS family
detect_os() {
    if [[ -f /etc/os-release ]]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        OS_ID="${ID}"
        OS_NAME="${PRETTY_NAME:-${ID}}"
    else
        die "Cannot detect OS — /etc/os-release not found"
    fi

    case "${OS_ID}" in
        fedora|rhel|centos|rocky|alma)
            PKG_FAMILY="rpm"
            PKG_INSTALL="dnf install -y"
            PKG_UPDATE="dnf makecache"
            ;;
        ubuntu|debian|linuxmint|pop)
            PKG_FAMILY="deb"
            PKG_INSTALL="apt-get install -y"
            PKG_UPDATE="apt-get update -qq"
            ;;
        *)
            die "Unsupported host OS: ${OS_ID}. Supported: Fedora, RHEL, Ubuntu, Debian"
            ;;
    esac

    info "Detected: ${OS_NAME} (${PKG_FAMILY})"
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-start)  START_DAEMON=false; shift ;;
        --dev)       DEV_MODE=true; shift ;;
        --prefix)    INSTALL_PREFIX="$2"; shift 2 ;;
        --help|-h)
            cat <<USAGE
Usage: sudo $0 [OPTIONS]

One-shot setup for Zyvor Fabric (vmspawnd) on Fedora/Ubuntu.
Installs deps, Rust, builds, installs, configures, and starts daemon.

Options:
  --no-start      Don't start the daemon after install
  --dev           Install dev tools (clippy, rustfmt)
  --prefix PATH   Install prefix (default: /usr)
  --help          Show this help

Example:
  sudo ./setup.sh
  sudo ./setup.sh --dev --prefix /usr/local
USAGE
            exit 0
            ;;
        *) die "Unknown option: $1. Use --help for usage." ;;
    esac
done

# ---------------------------------------------------------------------------
# 1. System dependencies
# ---------------------------------------------------------------------------
install_system_deps() {
    step "Installing system dependencies"

    ${PKG_UPDATE} || true

    case "${PKG_FAMILY}" in
        rpm)
            ${PKG_INSTALL} git make gcc curl wget tar gzip jq sqlite \
                systemd-container qemu-img qemu-system-x86 edk2-ovmf \
                openssl-devel pkg-config nodejs npm
            ;;
        deb)
            DEBIAN_FRONTEND=noninteractive ${PKG_INSTALL} git make gcc curl wget \
                tar gzip jq sqlite3 systemd-container qemu-utils qemu-system-x86 \
                ovmf libssl-dev pkg-config nodejs npm ca-certificates
            ;;
    esac

    # Ensure machined is running
    if command -v systemctl &>/dev/null && systemctl list-unit-files systemd-machined.service &>/dev/null; then
        systemctl enable --now systemd-machined 2>/dev/null || true
        success "systemd-machined enabled and started"
    fi

    success "System dependencies installed"
}

# ---------------------------------------------------------------------------
# 2. Rust installation
# ---------------------------------------------------------------------------
install_rust() {
    step "Installing Rust toolchain"

    if command -v rustc &>/dev/null; then
        local current
        current="$(rustc --version | awk '{print $2}')"
        if [[ "$(printf '%s\n' "${RUST_MIN_VERSION}" "${current}" | sort -V | head -1)" == "${RUST_MIN_VERSION}" ]]; then
            success "Rust ${current} already installed (>= ${RUST_MIN_VERSION})"
            return
        fi
        info "Found Rust ${current}, upgrading"
    fi

    if command -v rustup &>/dev/null; then
        rustup update stable
    else
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
        # shellcheck disable=SC1091
        source "${HOME}/.cargo/env"
    fi

    success "Rust $(rustc --version | awk '{print $2}') installed"
}

# ---------------------------------------------------------------------------
# 3. Build vmspawnd
# ---------------------------------------------------------------------------
build_vmspawnd() {
    step "Building Zyvor Fabric binaries (vmspawnd, vmctl)"

    local src_dir="${SCRIPT_DIR}"
    [[ -f "${src_dir}/backend/Cargo.toml" ]] || die "Cargo.toml not found in ${src_dir}/backend/. Run from zyvor-fabric source directory."

    cd "${src_dir}/backend"

    info "Building release binaries (this may take a few minutes)"
    cargo build --release 2>&1 | tail -10

    for bin in vmspawnd vmctl vmctl-tui; do
        if [[ -f "target/release/${bin}" ]]; then
            success "  target/release/${bin} ($(du -h "target/release/${bin}" | cut -f1))"
        fi
    done

    cd "${src_dir}"

    success "Backend binaries built"
}

build_web() {
    step "Building web dashboard"

    cd "${SCRIPT_DIR}/web"
    if [[ -f "package.json" ]]; then
        npm install --silent 2>&1 | tail -1
        npm run build 2>&1 | tail -3
        success "Web dashboard built to web/dist/"
    else
        warn "web/package.json not found — skipping"
    fi
    cd "${SCRIPT_DIR}"
}

# ---------------------------------------------------------------------------
# 4. Run tests
# ---------------------------------------------------------------------------
run_tests() {
    step "Running tests"
    cd "${SCRIPT_DIR}/backend"

    if cargo test 2>&1 | tail -10; then
        success "Tests passed"
    else
        warn "Some tests had issues — check output above"
    fi

    cd "${SCRIPT_DIR}"
}

# ---------------------------------------------------------------------------
# 5. Install binaries and config
# ---------------------------------------------------------------------------
install_binaries() {
    step "Installing binaries to ${INSTALL_PREFIX}/bin"
    install -d "${INSTALL_PREFIX}/bin"

    for bin in vmspawnd vmctl vmctl-tui; do
        if [[ -f "backend/target/release/${bin}" ]]; then
            install -m 0755 "backend/target/release/${bin}" "${INSTALL_PREFIX}/bin/${bin}"
            info "  Installed ${bin}"
        fi
    done

    export PATH="${INSTALL_PREFIX}/bin:${PATH}"

    success "Binaries installed to ${INSTALL_PREFIX}/bin/"
}

install_config() {
    step "Installing configuration"

    install -d /etc/vmspawnd
    install -d /var/lib/vmspawnd/images
    install -d /var/lib/vmspawnd/state
    install -d /var/log/vmspawnd
    install -d /run/vmspawnd

    if [[ ! -f /etc/vmspawnd/vmspawnd.toml ]] && [[ -f "${SCRIPT_DIR}/configs/vmspawnd.toml" ]]; then
        install -m 0644 "${SCRIPT_DIR}/configs/vmspawnd.toml" /etc/vmspawnd/vmspawnd.toml
        info "Installed config at /etc/vmspawnd/vmspawnd.toml"
    else
        info "/etc/vmspawnd/vmspawnd.toml already exists, skipping"
    fi

    if [[ -f "${SCRIPT_DIR}/configs/vmspawnd.env" ]]; then
        install -m 0640 "${SCRIPT_DIR}/configs/vmspawnd.env" /etc/vmspawnd/vmspawnd.env
    fi

    success "Configuration installed"
}

# ---------------------------------------------------------------------------
# 6. Systemd services
# ---------------------------------------------------------------------------
install_systemd() {
    step "Installing systemd services"

    local unit_dir="${INSTALL_PREFIX}/lib/systemd/system"
    install -d "${unit_dir}"

    for unit in vmspawnd.service vm@.service \
                vmspawnd-backup.service vmspawnd-backup.timer \
                vmspawnd-cleanup.service vmspawnd-cleanup.timer; do
        if [[ -f "${SCRIPT_DIR}/systemd/${unit}" ]]; then
            install -m 0644 "${SCRIPT_DIR}/systemd/${unit}" "${unit_dir}/${unit}"
            info "  Installed ${unit}"
        fi
    done

    # Install sysusers and tmpfiles
    if [[ -f "${SCRIPT_DIR}/systemd/vmspawnd.sysusers" ]]; then
        install -d "${INSTALL_PREFIX}/lib/sysusers.d"
        install -m 0644 "${SCRIPT_DIR}/systemd/vmspawnd.sysusers" "${INSTALL_PREFIX}/lib/sysusers.d/vmspawnd.conf"
        systemd-sysusers vmspawnd.conf 2>/dev/null || true
    fi

    if [[ -f "${SCRIPT_DIR}/systemd/vmspawnd.tmpfiles" ]]; then
        install -d "${INSTALL_PREFIX}/lib/tmpfiles.d"
        install -m 0644 "${SCRIPT_DIR}/systemd/vmspawnd.tmpfiles" "${INSTALL_PREFIX}/lib/tmpfiles.d/vmspawnd.conf"
        systemd-tmpfiles --create vmspawnd.conf 2>/dev/null || true
    fi

    if [[ -f "${SCRIPT_DIR}/systemd/vmspawnd.preset" ]]; then
        install -d "${INSTALL_PREFIX}/lib/systemd/system-preset"
        install -m 0644 "${SCRIPT_DIR}/systemd/vmspawnd.preset" "${INSTALL_PREFIX}/lib/systemd/system-preset/90-vmspawnd.preset"
    fi

    # Install helper scripts
    if [[ -d "${SCRIPT_DIR}/scripts" ]]; then
        local libexec_dir="${INSTALL_PREFIX}/libexec/vmspawnd"
        install -d "${libexec_dir}"
        for helper in backup-vms cleanup-store health-check; do
            if [[ -f "${SCRIPT_DIR}/scripts/${helper}" ]]; then
                install -m 0755 "${SCRIPT_DIR}/scripts/${helper}" "${libexec_dir}/${helper}"
            fi
        done
    fi

    systemctl daemon-reload
    success "Systemd services installed"
}

install_web() {
    step "Installing web dashboard"

    if [[ -d "${SCRIPT_DIR}/web/dist" ]]; then
        install -d "${INSTALL_PREFIX}/share/vmspawnd/web"
        cp -r "${SCRIPT_DIR}/web/dist/"* "${INSTALL_PREFIX}/share/vmspawnd/web/"
        success "Web dashboard installed to ${INSTALL_PREFIX}/share/vmspawnd/web/"
    else
        warn "web/dist not found — skipping dashboard install"
    fi
}

# ---------------------------------------------------------------------------
# 7. Start daemon
# ---------------------------------------------------------------------------
start_daemon() {
    step "Starting vmspawnd daemon"

    systemctl enable vmspawnd 2>/dev/null || true
    systemctl start vmspawnd

    sleep 2

    if systemctl is-active --quiet vmspawnd; then
        success "vmspawnd is running"
        journalctl -u vmspawnd --no-pager -n 5 2>/dev/null || true
    else
        warn "vmspawnd failed to start — check: journalctl -u vmspawnd -f"
        journalctl -u vmspawnd --no-pager -n 20 2>/dev/null || true
    fi
}

# ---------------------------------------------------------------------------
# 8. Dev tools (optional)
# ---------------------------------------------------------------------------
install_dev_tools() {
    step "Installing development tools"

    rustup component add clippy rustfmt 2>/dev/null || true
    cargo install cargo-watch 2>/dev/null || true

    success "Development tools installed"
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print_summary() {
    echo ""
    echo "✅ ================================================================"
    echo "✅  vmspawnd ${VMSPAWND_VERSION} — Setup Complete"
    echo "✅ ================================================================"
    echo ""
    echo "  Binaries:        ${INSTALL_PREFIX}/bin/vmspawnd, vmctl, vmctl-tui"
    echo "  Config:          /etc/vmspawnd/vmspawnd.toml"
    echo "  Data:            /var/lib/vmspawnd/"
    echo "  Logs:            /var/log/vmspawnd/"
    echo "  Service:         vmspawnd.service"
    echo "  Web dashboard:   ${INSTALL_PREFIX}/share/vmspawnd/web/"
    echo ""
    echo "  Installed binaries:"
    for bin in "${INSTALL_PREFIX}/bin/vm"*; do
        [[ -x "${bin}" ]] && echo "    - $(basename "${bin}")"
    done
    echo ""
    if systemctl is-active --quiet vmspawnd 2>/dev/null; then
        echo "  ✅ Daemon status: RUNNING"
        echo "  Dashboard:      http://localhost:9095/"
        echo "  API:            http://localhost:9095/api/health"
    else
        echo "  ⚠️ Daemon status: STOPPED"
    fi
    echo ""
    echo "🔹 Commands:"
    echo "  sudo systemctl start vmspawnd       # Start daemon"
    echo "  sudo systemctl stop vmspawnd        # Stop daemon"
    echo "  sudo systemctl status vmspawnd      # Check status"
    echo "  journalctl -u vmspawnd -f           # Follow logs"
    echo "  vmctl list                          # List VMs"
    echo "  vmctl create --name my-vm ...       # Create VM"
    echo ""
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    echo "                                                   _ "
    echo " __   ___ __ ___  ___ _ __   __ ___      ___ __  __| |"
    echo " \\ \\ / / '_ \` _ \\/ __| '_ \\ / _\` \\ \\ /\\ / / '_ \\/ _\` |"
    echo "  \\ V /| | | | | \\__ \\ |_) | (_| |\\ V  V /| | | | (_| |"
    echo "   \\_/ |_| |_| |_|___/ .__/ \\__,_| \\_/\\_/ |_| |_|\\__,_|"
    echo "                     |_|    One-Shot Setup v${VMSPAWND_VERSION}"
    echo

    need_root
    detect_os

    install_system_deps
    install_rust
    build_vmspawnd
    build_web
    run_tests
    install_binaries
    install_config
    install_systemd
    install_web

    if [[ "${DEV_MODE}" == true ]]; then
        install_dev_tools
    fi

    if [[ "${START_DAEMON}" == true ]]; then
        start_daemon
    fi

    print_summary
}

main "$@"
