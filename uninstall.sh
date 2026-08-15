#!/bin/bash
# ============================================================================
# uninstall.sh — Remove zyvor-fabricd from the system
# ============================================================================
# Usage:
#   sudo ./uninstall.sh              # Remove binaries, services, config
#   sudo ./uninstall.sh --keep-data  # Keep /var/lib/zyvor-fabricd
#   sudo ./uninstall.sh --purge      # Remove everything including data
# ============================================================================

set -euo pipefail

info()  { echo "  ✅ $*"; }
warn()  { echo "  ⚠️  $*"; }
step()  { echo ""; echo "  🔧 $*"; }

KEEP_DATA=true
PURGE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --keep-data) KEEP_DATA=true; shift ;;
        --purge)     PURGE=true; KEEP_DATA=false; shift ;;
        --help|-h)
            echo "Usage: sudo $0 [--keep-data|--purge]"
            echo ""
            echo "  --keep-data  Keep /var/lib/zyvor-fabricd (default)"
            echo "  --purge      Remove everything including VM data"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

if [[ $EUID -ne 0 ]]; then
    echo "  ❌ This script must be run as root (use: sudo ./uninstall.sh)"
    exit 1
fi

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║     🗑️  zyvor-fabricd Uninstall                       ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""

# Stop and disable services
step "Stopping services"
for svc in zyvor-fabricd.service zyvor-fabricd-backup.timer zyvor-fabricd-cleanup.timer; do
    if systemctl is-active "$svc" &>/dev/null; then
        systemctl stop "$svc" 2>/dev/null || true
        info "Stopped $svc"
    fi
    if systemctl is-enabled "$svc" &>/dev/null; then
        systemctl disable "$svc" 2>/dev/null || true
    fi
done

# Remove systemd units
step "Removing systemd units"
for unit in zyvor-fabricd.service vm@.service \
            zyvor-fabricd-backup.service zyvor-fabricd-backup.timer \
            zyvor-fabricd-cleanup.service zyvor-fabricd-cleanup.timer; do
    for dir in /usr/lib/systemd/system /etc/systemd/system; do
        if [[ -f "$dir/$unit" ]]; then
            rm -f "$dir/$unit"
            info "Removed $dir/$unit"
        fi
    done
done

# Remove preset, sysusers, tmpfiles
rm -f /usr/lib/systemd/system-preset/90-zyvor-fabricd.preset 2>/dev/null
rm -f /usr/lib/sysusers.d/zyvor-fabricd.conf 2>/dev/null
rm -f /usr/lib/tmpfiles.d/zyvor-fabricd.conf 2>/dev/null

systemctl daemon-reload
info "Systemd units removed"

# Remove binaries
step "Removing binaries"
for bin in zyvor-fabricd zyvorctl zyvorctl-tui zyvorctl; do
    for dir in /usr/bin /usr/local/bin; do
        if [[ -f "$dir/$bin" ]]; then
            rm -f "$dir/$bin"
            info "Removed $dir/$bin"
        fi
    done
done

# Remove libexec helpers
rm -rf /usr/libexec/zyvor-fabricd 2>/dev/null
rm -rf /usr/local/libexec/zyvor-fabricd 2>/dev/null

# Remove web dashboard
step "Removing web dashboard"
for dir in /usr/share/zyvor-fabricd /usr/local/share/zyvor-fabricd; do
    if [[ -d "$dir" ]]; then
        rm -rf "$dir"
        info "Removed $dir"
    fi
done

# Remove config
step "Removing configuration"
rm -rf /etc/zyvor-fabricd 2>/dev/null && info "Removed /etc/zyvor-fabricd" || true
rm -f /etc/modules-load.d/zyvor-fabricd.conf 2>/dev/null
rm -f /etc/logrotate.d/zyvor-fabricd 2>/dev/null
rm -f /etc/bash_completion.d/zyvorctl 2>/dev/null
rm -f /etc/bash_completion.d/zyvorctl 2>/dev/null

# Remove data
if $PURGE; then
    step "Purging data"
    rm -rf /var/lib/zyvor-fabricd 2>/dev/null && info "Removed /var/lib/zyvor-fabricd" || true
    rm -rf /var/log/zyvor-fabricd 2>/dev/null && info "Removed /var/log/zyvor-fabricd" || true
    rm -rf /run/zyvor-fabricd 2>/dev/null
elif $KEEP_DATA; then
    step "Keeping data"
    info "/var/lib/zyvor-fabricd preserved (use --purge to remove)"
    info "/var/log/zyvor-fabricd preserved"
fi

echo ""
echo "  ════════════════════════════════════════════════════"
echo "  🎉 zyvor-fabricd uninstalled"
echo "  ════════════════════════════════════════════════════"
echo ""
if $KEEP_DATA; then
    echo "  📁 Kept: /var/lib/zyvor-fabricd (VM images and state)"
    echo "  📁 Kept: /var/log/zyvor-fabricd (logs)"
    echo ""
    echo "  To remove data: sudo ./uninstall.sh --purge"
fi
echo ""
