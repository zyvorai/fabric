#!/usr/bin/env bash
# Copy Zyvor sync scripts + helpers to sibling projects under ../
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/zyvor-canonical.sh
source "${SCRIPT_DIR}/lib/zyvor-canonical.sh"
CANONICAL_ROOT="$(zyvor_canonical_root "${SCRIPT_DIR}")"
PARENT="$(cd "${CANONICAL_ROOT}/.." && pwd)"

REPOS=(
  Aether cockpit forge hyper2kvm- hypercluster hypersdk- hypersdk-web
  IronWolf machina mkosi-kernel nightforge ragnarok v9s VMRogue vmspawn
)

FILES=(
  sync-proprietary-license.sh
  sync-legal-framework.sh
  sync-source-license-metadata.sh
  sync-source-license-metadata.py
  sync-zyvor-tooling.sh
  sync-all-zyvor-legal.sh
  lib/zyvor-canonical.sh
  lib/license-accept.sh
  lib/copy-legal-to-bundle.sh
  lib/copy-zyvor-legal-to-bundle.sh
  lib/package-ui.sh
  lib/write-customer-help.sh
  lib/START_HERE.txt
  lib/generate-customer-pdfs.py
)

echo "Canonical: ${CANONICAL_ROOT}"
echo "Parent: ${PARENT}"
echo "Excluded: guestkit"
echo ""

for name in "${REPOS[@]}"; do
  dest_root="${PARENT}/${name}"
  if [[ ! -d "${dest_root}" ]]; then
    echo "skip ${name} (missing)"
    continue
  fi
  if [[ "$(cd "${CANONICAL_ROOT}" && pwd -P)" = "$(cd "${dest_root}" && pwd -P)" ]]; then
    echo "— ${name} (canonical source)"
    continue
  fi
  mkdir -p "${dest_root}/scripts/lib"
  for rel in "${FILES[@]}"; do
    src="${CANONICAL_ROOT}/scripts/${rel}"
    dest="${dest_root}/scripts/${rel}"
    if [[ ! -f "${src}" ]]; then
      echo "  warn: missing ${rel}" >&2
      continue
    fi
    cp "${src}" "${dest}"
    chmod +x "${dest}" 2>/dev/null || true
  done
  echo "ok: ${name}/scripts/"
done

echo "Done."
