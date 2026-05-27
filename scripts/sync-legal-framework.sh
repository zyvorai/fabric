#!/usr/bin/env bash
# Sync docs/legal framework from PacketWolf to sibling projects under ../
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/zyvor-canonical.sh
source "${SCRIPT_DIR}/lib/zyvor-canonical.sh"
CANONICAL_ROOT="$(zyvor_canonical_root "${SCRIPT_DIR}")"
LEGAL_SRC="${CANONICAL_ROOT}/docs/legal"
PARENT="$(cd "${CANONICAL_ROOT}/.." && pwd)"

PROJECTS=(
  Aether cockpit forge hyper2kvm- hypercluster hypersdk- hypersdk-web
  IronWolf machina mkosi-kernel nightforge ragnarok v9s VMRogue vmspawn
)
# Excluded (keep OSS licenses + their own legal docs):
# guestkit (LGPL), tt/cloud-netconfig, tt/hyper2kvm, tt/hypersdk,
# tt/hypersdk-org-profile, tt/netctl, tt/netevd

if [[ ! -d "${LEGAL_SRC}" ]]; then
  echo "ERROR: missing ${LEGAL_SRC}" >&2
  exit 1
fi

echo "Sync legal framework from ${LEGAL_SRC}"
echo "Parent: ${PARENT}"
echo "Excluded: guestkit + tt/{cloud-netconfig,hyper2kvm,hypersdk,hypersdk-org-profile,netctl,netevd}"
echo ""

for name in "${PROJECTS[@]}"; do
  dest_root="${PARENT}/${name}"
  dest="${dest_root}/docs/legal"
  if [[ ! -d "${dest_root}" ]]; then
    echo "skip (no repo): ${name}"
    continue
  fi
  if [[ "$(cd "${CANONICAL_ROOT}" && pwd -P)" = "$(cd "${dest_root}" && pwd -P)" ]]; then
    echo "skip (self): ${name}"
    continue
  fi
  mkdir -p "${dest}"
  rsync -a --delete \
    --exclude 'SOURCE-DOCUMENTS.md' \
    "${LEGAL_SRC}/" "${dest}/"
  echo "ok: ${name} -> docs/legal/"
done

echo ""
echo "Done. Run ./scripts/sync-proprietary-license.sh to refresh LICENSE in each repo."
