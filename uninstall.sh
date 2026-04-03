#!/bin/bash
# ============================================================================
# uninstall.sh — Remove vmspawnd from the system
# ============================================================================
# Usage:
#   sudo ./uninstall.sh              # Remove binaries, services, config
#   sudo ./uninstall.sh --keep-data  # Keep /var/lib/vmspawnd
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
            echo "  --keep-data  Keep /var/lib/vmspawnd (default)"
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
echo "  ║     🗑️  vmspawnd Uninstall                       ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""

# Stop and disable services
step "Stopping services"
for svc in vmspawnd.service vmspawnd.socket vmspawnd-backup.timer vmspawnd-cleanup.timer; do
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
for unit in vmspawnd.service vmspawnd.socket vm@.service \
            vmspawnd-backup.service vmspawnd-backup.timer \
            vmspawnd-cleanup.service vmspawnd-cleanup.timer; do
    for dir in /usr/lib/systemd/system /etc/systemd/system; do
        if [[ -f "$dir/$unit" ]]; then
            rm -f "$dir/$unit"
            info "Removed $dir/$unit"
        fi
    done
done

# Remove preset, sysusers, tmpfiles
rm -f /usr/lib/systemd/system-preset/90-vmspawnd.preset 2>/dev/null
rm -f /usr/lib/sysusers.d/vmspawnd.conf 2>/dev/null
rm -f /usr/lib/tmpfiles.d/vmspawnd.conf 2>/dev/null

systemctl daemon-reload
info "Systemd units removed"

# Remove binaries
step "Removing binaries"
for bin in vmspawnd vmctl vmctl-tui vmspawnctl; do
    for dir in /usr/bin /usr/local/bin; do
        if [[ -f "$dir/$bin" ]]; then
            rm -f "$dir/$bin"
            info "Removed $dir/$bin"
        fi
    done
done

# Remove libexec helpers
rm -rf /usr/libexec/vmspawnd 2>/dev/null
rm -rf /usr/local/libexec/vmspawnd 2>/dev/null

# Remove web dashboard
step "Removing web dashboard"
for dir in /usr/share/vmspawnd /usr/local/share/vmspawnd; do
    if [[ -d "$dir" ]]; then
        rm -rf "$dir"
        info "Removed $dir"
    fi
done

# Remove config
step "Removing configuration"
rm -rf /etc/vmspawnd 2>/dev/null && info "Removed /etc/vmspawnd" || true
rm -f /etc/modules-load.d/vmspawnd.conf 2>/dev/null
rm -f /etc/logrotate.d/vmspawnd 2>/dev/null
rm -f /etc/bash_completion.d/vmspawnctl 2>/dev/null
rm -f /etc/bash_completion.d/vmctl 2>/dev/null

# Remove data
if $PURGE; then
    step "Purging data"
    rm -rf /var/lib/vmspawnd 2>/dev/null && info "Removed /var/lib/vmspawnd" || true
    rm -rf /var/log/vmspawnd 2>/dev/null && info "Removed /var/log/vmspawnd" || true
    rm -rf /run/vmspawnd 2>/dev/null
elif $KEEP_DATA; then
    step "Keeping data"
    info "/var/lib/vmspawnd preserved (use --purge to remove)"
    info "/var/log/vmspawnd preserved"
fi

echo ""
echo "  ════════════════════════════════════════════════════"
echo "  🎉 vmspawnd uninstalled"
echo "  ════════════════════════════════════════════════════"
echo ""
if $KEEP_DATA; then
    echo "  📁 Kept: /var/lib/vmspawnd (VM images and state)"
    echo "  📁 Kept: /var/log/vmspawnd (logs)"
    echo ""
    echo "  To remove data: sudo ./uninstall.sh --purge"
fi
echo ""
