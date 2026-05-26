#!/usr/bin/env bash
# Require acceptance of the PacketWolf proprietary LICENSE before deploy/package.
# shellcheck shell=bash

license_accept_project_dir() {
    local script_dir="${1:?}"
    cd "$(dirname "$script_dir")/.." && pwd
}

license_accept_file() {
    local root="${1:?}"
    echo "${root}/LICENSE"
}

license_accept_hash() {
    local file="${1:?}"
    if command -v shasum &>/dev/null; then
        shasum -a 256 "$file" | awk '{print $1}'
    elif command -v sha256sum &>/dev/null; then
        sha256sum "$file" | awk '{print $1}'
    else
        wc -c <"$file" | tr -d ' '
    fi
}

license_accept_record_path() {
    echo "${HOME}/.packetwolf/license-acceptance.json"
}

license_accept_already_recorded() {
    local root="${1:?}"
    local license_file
    license_file="$(license_accept_file "$root")"
    local current_hash
    current_hash="$(license_accept_hash "$license_file")"
    local record
    record="$(license_accept_record_path)"
    [ -f "$record" ] || return 1
    command -v python3 &>/dev/null || return 1
    python3 - "$record" "$current_hash" <<'PY' >/dev/null 2>&1
import json, sys
path, want = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
sys.exit(0 if data.get("licenseHash") == want and data.get("accepted") is True else 1)
PY
}

license_accept_write_record() {
    local root="${1:?}"
    local actor="${2:-${USER:-unknown}}"
    local license_file
    license_file="$(license_accept_file "$root")"
    local hash
    hash="$(license_accept_hash "$license_file")"
    mkdir -p "${HOME}/.packetwolf"
    local record
    record="$(license_accept_record_path)"
    local ts
    ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    if command -v python3 &>/dev/null; then
        python3 - "$record" "$hash" "$actor" "$ts" <<'PY'
import json, sys
path, h, actor, ts = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
with open(path, "w") as f:
    json.dump({
        "accepted": True,
        "licenseVersion": "1.2",
        "licenseHash": h,
        "acceptedAt": ts,
        "acceptedBy": actor,
        "product": "PacketWolf",
        "licensor": "ZyvorAI Labs Private Limited",
        "brand": "zyvor.dev",
    }, f, indent=2)
    f.write("\n")
PY
    else
        printf '{"accepted":true,"licenseHash":"%s","acceptedAt":"%s","acceptedBy":"%s"}\n' \
            "$hash" "$ts" "$actor" >"$record"
    fi
}

license_accept_show_summary() {
    local root="${1:?}"
    local license_file
    license_file="$(license_accept_file "$root")"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  PacketWolf — ZyvorAI Labs Proprietary License (zyvor.dev)"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  File: ${license_file}"
    echo ""
    sed -n '1,24p' "$license_file" | sed 's/^/  /'
    echo "  ..."
    echo "  Full text: ${license_file}"
    echo ""
    echo "  You may NOT redistribute, sublicense, or offer as a service without"
    echo "  written permission. Deployment records acceptance on this machine."
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
}

# Exit 0 if accepted; otherwise prompt or fail.
# Env bypass: PACKETWOLF_LICENSE_ACCEPT=1 (must match current LICENSE hash in record
# after first interactive accept, or sets record on first use).
require_packetwolf_license_accept() {
    local root="${1:?}"
    local license_file
    license_file="$(license_accept_file "$root")"
    if [ ! -f "$license_file" ]; then
        echo "ERROR: Missing LICENSE at ${license_file}" >&2
        exit 1
    fi

    if license_accept_already_recorded "$root"; then
        return 0
    fi

    if [ "${PACKETWOLF_LICENSE_ACCEPT:-}" = "1" ]; then
        license_accept_write_record "$root" "${PACKETWOLF_LICENSE_ACTOR:-${USER:-unknown}}"
        echo "✅ License accepted (PACKETWOLF_LICENSE_ACCEPT=1). Record: $(license_accept_record_path)"
        return 0
    fi

    if [ ! -t 0 ] || [ ! -t 1 ]; then
        echo "ERROR: Proprietary license not accepted." >&2
        echo "  Read: ${license_file}" >&2
        echo "  Then run interactively and type ACCEPT, or:" >&2
        echo "    export PACKETWOLF_LICENSE_ACCEPT=1" >&2
        exit 1
    fi

    license_accept_show_summary "$root"
    echo -n "Type ACCEPT to agree to the Proprietary License: "
    local reply
    read -r reply
    if [ "$reply" != "ACCEPT" ]; then
        echo "License not accepted. Deploy aborted." >&2
        exit 1
    fi
    license_accept_write_record "$root" "${USER:-unknown}"
    echo "✅ License accepted. Record saved to $(license_accept_record_path)"
}
