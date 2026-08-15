#!/bin/bash
# ============================================================================
# selftest.sh — Post-install verification for zyvor-fabricd
# ============================================================================
# Checks that zyvor-fabricd is correctly installed and running.
#
# Usage:
#   ./scripts/selftest.sh              # Run all checks
#   ./scripts/selftest.sh --quick      # Skip API tests
# ============================================================================

set -euo pipefail

PASS=0
FAIL=0
WARN=0
QUICK=false
API_PORT="${ZYVOR_FABRICD_PORT:-9095}"

[[ "${1:-}" == "--quick" ]] && QUICK=true

pass() { echo "  ✅ $*"; ((PASS++)); }
fail() { echo "  ❌ $*"; ((FAIL++)); }
warn() { echo "  ⚠️  $*"; ((WARN++)); }
section() { echo ""; echo "  ── $* ──"; }

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║     🩺 zyvor-fabricd Self-Test                        ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""

# ── Binaries ──
section "Binaries"
for bin in zyvor-fabricd zyvorctl zyvorctl-tui; do
    if command -v "$bin" &>/dev/null; then
        ver=$("$bin" --version 2>/dev/null || echo "installed")
        pass "$bin: $ver"
    else
        fail "$bin: not found in PATH"
    fi
done

# ── System tools ──
section "System Tools"
for tool in systemd-vmspawn machinectl qemu-img systemd-nspawn; do
    if command -v "$tool" &>/dev/null; then
        pass "$tool: $(command -v "$tool")"
    else
        warn "$tool: not found"
    fi
done

# ── Configuration ──
section "Configuration"
if [[ -f /etc/zyvor-fabricd/zyvor-fabricd.toml ]]; then
    pass "Config: /etc/zyvor-fabricd/zyvor-fabricd.toml"
else
    fail "Config: /etc/zyvor-fabricd/zyvor-fabricd.toml not found"
fi

if [[ -f /etc/zyvor-fabricd/zyvor-fabricd.env ]]; then
    pass "Environment: /etc/zyvor-fabricd/zyvor-fabricd.env"
else
    warn "Environment: /etc/zyvor-fabricd/zyvor-fabricd.env not found (optional)"
fi

# ── Directories ──
section "Directories"
for dir in /var/lib/zyvor-fabricd /var/lib/zyvor-fabricd/images /var/log/zyvor-fabricd; do
    if [[ -d "$dir" ]]; then
        pass "$dir ($(du -sh "$dir" 2>/dev/null | cut -f1 || echo 'exists'))"
    else
        fail "$dir: not found"
    fi
done

# ── Systemd ──
section "Systemd Services"
for unit in zyvor-fabricd.service zyvor-fabricd-backup.service zyvor-fabricd-cleanup.service; do
    if systemctl list-unit-files "$unit" &>/dev/null 2>&1; then
        if systemctl is-active "$unit" &>/dev/null; then
            pass "$unit: running"
        elif systemctl is-enabled "$unit" &>/dev/null; then
            warn "$unit: enabled but not running"
        else
            warn "$unit: installed but not enabled"
        fi
    else
        fail "$unit: not installed"
    fi
done

for unit in vm@.service; do
    if systemctl list-unit-files "$unit" &>/dev/null 2>&1; then
        pass "$unit: installed"
    else
        warn "$unit: not installed (optional)"
    fi
done

# ── machined ──
section "systemd-machined"
if systemctl is-active systemd-machined &>/dev/null; then
    pass "systemd-machined: running"
    MACHINE_COUNT=$(machinectl list --no-legend 2>/dev/null | wc -l || echo "0")
    pass "Machines registered: $MACHINE_COUNT"
else
    warn "systemd-machined: not running"
fi

# ── Web Dashboard ──
section "Web Dashboard"
for dir in /usr/share/zyvor-fabricd/web /usr/local/share/zyvor-fabricd/web; do
    if [[ -d "$dir" ]] && [[ -f "$dir/index.html" ]]; then
        FILE_COUNT=$(find "$dir" -type f | wc -l)
        pass "Dashboard: $dir ($FILE_COUNT files)"
        break
    fi
done
if [[ ! -d /usr/share/zyvor-fabricd/web ]] && [[ ! -d /usr/local/share/zyvor-fabricd/web ]]; then
    warn "Dashboard: not deployed"
fi

# ── API Tests ──
if ! $QUICK && systemctl is-active zyvor-fabricd &>/dev/null; then
    section "API Health"

    # Health endpoint
    if HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${API_PORT}/api/health" 2>/dev/null); then
        if [[ "$HTTP_CODE" == "200" ]]; then
            pass "GET /api/health: 200 OK"
        else
            fail "GET /api/health: HTTP $HTTP_CODE"
        fi
    else
        fail "GET /api/health: connection refused"
    fi

    # VM list endpoint
    if HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${API_PORT}/api/vms" 2>/dev/null); then
        if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "401" ]]; then
            pass "GET /api/vms: HTTP $HTTP_CODE"
        else
            warn "GET /api/vms: HTTP $HTTP_CODE"
        fi
    else
        warn "GET /api/vms: connection failed"
    fi
elif ! $QUICK; then
    section "API Health"
    warn "Skipped — zyvor-fabricd not running"
fi

# ── Summary ──
echo ""
echo "  ════════════════════════════════════════════════════"
echo "  Results: $PASS passed, $WARN warnings, $FAIL failed"
echo "  ════════════════════════════════════════════════════"
echo ""

if [[ $FAIL -gt 0 ]]; then
    echo "  Some checks failed. Run these to investigate:"
    echo "    systemctl status zyvor-fabricd"
    echo "    journalctl -u zyvor-fabricd -n 20"
    echo ""
    exit 1
elif [[ $WARN -gt 0 ]]; then
    echo "  All critical checks passed with $WARN warnings."
    echo ""
    exit 0
else
    echo "  All checks passed! zyvor-fabricd is fully operational."
    echo ""
    exit 0
fi
