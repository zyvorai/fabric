#!/usr/bin/env bash
# Full Zyvor legal sync: LICENSE, docs/legal, source metadata, tooling scripts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"
./scripts/sync-proprietary-license.sh
./scripts/sync-legal-framework.sh
./scripts/sync-source-license-metadata.sh
./scripts/sync-zyvor-tooling.sh
echo ""
echo "All Zyvor legal sync steps complete."
