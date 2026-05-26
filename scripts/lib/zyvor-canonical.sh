#!/usr/bin/env bash
# Resolve canonical Zyvor license root (packetwolf under tt/).
zyvor_canonical_root() {
    local script_dir="${1:?script dir}"
    local parent
    parent="$(cd "${script_dir}/../.." && pwd)"
    if [[ -d "${parent}/packetwolf/LICENSE" ]] || [[ -f "${parent}/packetwolf/LICENSE" ]]; then
        echo "${parent}/packetwolf"
        return 0
    fi
    echo "$(cd "${script_dir}/.." && pwd)"
}
