#!/usr/bin/env bash
# Apply proprietary license metadata + source headers across tt/ repos (except guestkit).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "${SCRIPT_DIR}/sync-source-license-metadata.py" "$@"
