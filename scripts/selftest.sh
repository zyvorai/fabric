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
for bin in zyvor-fabricd zyvorctl; do
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

# ── Systemd (optional — zyvor-fabricd runs fine without it) ──
if command -v systemctl &>/dev/null; then
    section "Systemd (optional)"
    if systemctl list-unit-files zyvor-fabricd.service &>/dev/null 2>&1; then
        if systemctl is-active zyvor-fabricd.service &>/dev/null; then
            pass "zyvor-fabricd.service: running under systemd"
        else
            warn "zyvor-fabricd.service: installed but not running under systemd (fine if it's supervised another way)"
        fi
    else
        warn "zyvor-fabricd.service: not installed (fine — it's optional)"
    fi


    # Only relevant to the "machinectl" driver backend — the "ephemera"
    # backend has no systemd-machined dependency at all.
    if systemctl is-active systemd-machined &>/dev/null; then
        pass "systemd-machined: running"
        MACHINE_COUNT=$(machinectl list --no-legend 2>/dev/null | wc -l || echo "0")
        pass "Machines registered (machinectl backend): $MACHINE_COUNT"
    else
        warn "systemd-machined: not running (fine if driver.backend = \"ephemera\")"
    fi
else
    section "Systemd (optional)"
    warn "systemctl not found — zyvor-fabricd doesn't require it, checking via HTTP instead"
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
# Gate on the daemon actually answering HTTP, not on it running under
# systemd — it may be supervised any other way, or run in the foreground.
if ! $QUICK && curl -sf -o /dev/null "http://localhost:${API_PORT}/health" 2>/dev/null; then
    section "API Health"

    # Health endpoint
    if HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${API_PORT}/health" 2>/dev/null); then
        if [[ "$HTTP_CODE" == "200" ]]; then
            pass "GET /health: 200 OK"
        else
            fail "GET /health: HTTP $HTTP_CODE"
        fi
    else
        fail "GET /health: connection refused"
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

    # Ephemera control plane (optional — only relevant when
    # driver.backend = "ephemera" in zyvor-fabricd.toml)
    EPHEMERA_URL="${EPHEMERA_URL:-http://127.0.0.1:7788}"
    if curl -sf -o /dev/null "${EPHEMERA_URL}/healthz" 2>/dev/null; then
        pass "Ephemera at ${EPHEMERA_URL}: healthy"
    else
        warn "Ephemera at ${EPHEMERA_URL}: not reachable (fine if driver.backend = \"machinectl\")"
    fi
elif ! $QUICK; then
    section "API Health"
    warn "Skipped — zyvor-fabricd not answering on port ${API_PORT}"
fi

# ── Summary ──
echo ""
echo "  ════════════════════════════════════════════════════"
echo "  Results: $PASS passed, $WARN warnings, $FAIL failed"
echo "  ════════════════════════════════════════════════════"
echo ""

if [[ $FAIL -gt 0 ]]; then
    echo "  Some checks failed. Run these to investigate:"
    echo "    curl http://localhost:${API_PORT}/health"
    if command -v systemctl &>/dev/null && systemctl list-unit-files zyvor-fabricd.service &>/dev/null 2>&1; then
        echo "    systemctl status zyvor-fabricd"
        echo "    journalctl -u zyvor-fabricd -n 20"
    fi
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
